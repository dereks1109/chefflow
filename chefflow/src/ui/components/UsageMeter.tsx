import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useTierStore } from '../../state/useTierStore';
import {
  getQuotaSnapshot,
  type QuotaKind,
  type QuotaSnapshotResponse,
} from '../../core/tier/quotaClient';

// Compact pill mounted in TopNav + MobileTopBar. Hidden for pro/business
// (no caps to display) and in E2E mode (no Clerk JWT to authenticate).

function activeKind(pathname: string): QuotaKind {
  if (pathname.startsWith('/recipes')) return 'recipe';
  if (pathname.startsWith('/events')) return 'event';
  return 'llm';
}

export default function UsageMeter() {
  const tier = useTierStore((s) => s.tier);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const [snapshot, setSnapshot] = useState<QuotaSnapshotResponse | null>(null);

  const e2eMode = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';

  const refresh = useCallback(async () => {
    // Skip the worker call for signed-out users — it would 401 anyway and
    // anon users have no quota to show. (Caps are still enforced server-
    // side for any worker route that's actually reached.)
    if (e2eMode || tier !== 'free' || !isSignedIn) return;
    try {
      setSnapshot(await getQuotaSnapshot());
    } catch {
      // Silent — the meter is best-effort. Caps are still enforced server-side.
      setSnapshot(null);
    }
  }, [tier, e2eMode, isSignedIn]);

  // Refetch when the tier changes (e.g. user upgrades mid-session) and on
  // every route change so the meter reflects fresh state after a create.
  useEffect(() => { void refresh(); }, [refresh, pathname]);

  if (!isSignedIn && !e2eMode) return null;
  if (tier !== 'free' || e2eMode || !snapshot) return null;

  const kind = activeKind(pathname);
  const q = snapshot.quotas[kind];
  const label = kind === 'recipe' ? 'recipes' : kind === 'event' ? 'events' : 'AI';
  const remainingLow = q.remaining !== null && q.remaining <= 1;

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      title={`${label} today — click to manage your plan`}
      aria-label={`${q.count} of ${q.limit} ${label} used today`}
      className={[
        'hidden sm:flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium',
        'border transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        remainingLow
          ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300'
          : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 dark:hover:bg-surface-3',
      ].join(' ')}
    >
      <span>{label} {q.count}/{q.limit}</span>
    </button>
  );
}
