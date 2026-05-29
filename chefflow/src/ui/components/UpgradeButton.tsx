import { Sparkles } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

// Signed-in nav CTA. Always visible to authenticated chefs so the
// upgrade / plan-management entry point is one click away regardless
// of tier. Hidden for anonymous guests — they have the "Sign in"
// avatar slot; pushing a paid CTA before they have an account is too
// aggressive.
//
// Label is tier-aware:
//   free       → "Upgrade"                (opens UpgradeSheet → Pro / Enterprise)
//   pro        → "Upgrade to Enterprise"  (opens UpgradeSheet)
//   business   → "Upgrade to Enterprise"  (legacy intermediate tier — same target)
//   enterprise → "Manage plan"            (opens UpgradeSheet; chef can review / cancel)
//
// The UpgradeSheet itself decides what to show for each current tier;
// this button only controls the entry-point copy.

interface TierCopy {
  label: string;
  ariaLabel: string;
}

const TIER_COPY: Record<string, TierCopy> = {
  free: { label: 'Upgrade', ariaLabel: 'Upgrade to Pro' },
  pro: { label: 'Upgrade to Enterprise', ariaLabel: 'Upgrade to Enterprise' },
  business: { label: 'Upgrade to Enterprise', ariaLabel: 'Upgrade to Enterprise' },
  enterprise: { label: 'Manage plan', ariaLabel: 'Manage your subscription' },
};

export default function UpgradeButton() {
  const tier = useTierStore((s) => s.tier);
  const openWith = useUpgradeSheetStore((s) => s.openWith);
  const { isSignedIn } = useUser();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  if (!isE2E && !isSignedIn) return null;
  const copy = TIER_COPY[tier] ?? TIER_COPY.free;
  return (
    <button
      type="button"
      onClick={() => openWith('general')}
      aria-label={copy.ariaLabel}
      data-testid="nav-upgrade-button"
      className={[
        'inline-flex items-center gap-1.5',
        'px-2.5 h-7 rounded-full',
        'text-xs font-semibold',
        'bg-accent text-white hover:bg-accent/90',
        'transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <Sparkles size={13} aria-hidden="true" />
      <span>{copy.label}</span>
    </button>
  );
}
