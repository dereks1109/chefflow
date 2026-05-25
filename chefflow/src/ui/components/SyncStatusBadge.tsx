import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { Cloud, CloudOff, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { db } from '../../db/dexie';
import { useSyncStore } from '../../state/useSyncStore';
import { runSync } from '../../core/sync/syncEngine';

// Surfaces the otherwise-invisible sync state. Until this badge existed,
// every failure was silently swallowed and users had no way to know their
// edits hadn't reached D1.

function formatRelative(ts: number, now: number = Date.now()): string {
  if (ts === 0) return 'never';
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Count rows that haven't been pushed yet — i.e. local edits sitting in
// Dexie waiting for the next sync round. Reactive via liveQuery so the
// badge updates the instant a write lands or a sync flips `synced: true`.
function countPending(): Promise<number> {
  return Promise.all([
    db.recipes.toArray(),
    db.events.toArray(),
    db.menus.toArray(),
    db.allergenAudits.toArray(),
  ]).then((tables) =>
    tables.reduce((sum, rows) => sum + rows.filter((r) => r.synced !== true).length, 0),
  );
}

export default function SyncStatusBadge() {
  const status = useSyncStore((s) => s.status);
  const lastPulledAt = useSyncStore((s) => s.lastPulledAt);
  const lastPushedAt = useSyncStore((s) => s.lastPushedAt);
  const lastError = useSyncStore((s) => s.lastError);
  const ownerId = useSyncStore((s) => s.ownerId);

  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  // Tick every 30s so "2m ago" doesn't go stale while the page is idle.
  const [, forceTick] = useState(0);

  useEffect(() => {
    const obs = liveQuery(() => countPending());
    const sub = obs.subscribe({
      next: setPending,
      error: () => setPending(0),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!ownerId) return null; // anon — nothing to show.

  const lastSync = Math.max(lastPulledAt, lastPushedAt);

  // Order of precedence: syncing > error > offline > idle.
  let icon, tone, label, hover;
  if (status === 'syncing') {
    icon = <Loader2 size={14} className="animate-spin" aria-hidden="true" />;
    tone = 'text-slate-300';
    label = 'Syncing…';
    hover = 'Pulling + pushing changes';
  } else if (status === 'error') {
    icon = <AlertCircle size={14} aria-hidden="true" />;
    tone = 'text-red-400';
    label = pending > 0 ? `Sync error — ${pending} pending` : 'Sync error';
    hover = lastError ?? 'Last sync attempt failed';
  } else if (!online) {
    icon = <CloudOff size={14} aria-hidden="true" />;
    tone = 'text-amber-400';
    label = pending > 0 ? `Offline — ${pending} pending` : 'Offline';
    hover = 'Changes will sync when you reconnect';
  } else {
    icon = <Cloud size={14} aria-hidden="true" />;
    tone = 'text-emerald-400';
    label = lastSync === 0 ? 'Not yet synced' : `Synced ${formatRelative(lastSync)}`;
    hover = pending > 0 ? `${pending} change(s) pending push` : 'All changes synced';
  }

  const onRetry = () => {
    void runSync({ store: useSyncStore.getState() });
  };

  return (
    <button
      type="button"
      onClick={onRetry}
      title={hover}
      aria-label={`Sync status: ${label}. Click to retry.`}
      data-testid="sync-status-badge"
      className={[
        'inline-flex items-center gap-1.5 px-2 h-8 rounded-md text-xs font-medium',
        'bg-surface-3/40 hover:bg-surface-3 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        tone,
      ].join(' ')}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
      {status === 'error' && (
        <RefreshCw size={12} aria-hidden="true" className="ml-0.5" />
      )}
    </button>
  );
}
