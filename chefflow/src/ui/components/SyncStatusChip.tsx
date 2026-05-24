import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useSyncStore } from '../../state/syncStore';
import { syncNow } from '../../db/syncClient';

function formatRelative(ts: number | null, nowMs: number | null): string {
  if (!ts || !nowMs) return 'never';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Small header chip showing sync state. Clicking forces a sync.
export default function SyncStatusChip() {
  const { status, lastSyncedAt, pendingCount } = useSyncStore();
  // The relative timestamp needs to re-render so "2m ago" doesn't go stale.
  // Initialised to null + populated asynchronously (via microtask + interval)
  // so we don't call setState synchronously inside the effect body.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    Promise.resolve().then(() => setNow(Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  let icon = <Cloud size={14} aria-hidden="true" />;
  let label: string;
  let tone = 'text-slate-400';

  if (status === 'syncing') {
    icon = <RefreshCw size={14} className="animate-spin" aria-hidden="true" />;
    label = 'Syncing…';
    tone = 'text-accent';
  } else if (status === 'offline') {
    icon = <CloudOff size={14} aria-hidden="true" />;
    label = pendingCount > 0 ? `Offline — ${pendingCount} pending` : 'Offline';
    tone = 'text-amber-500';
  } else if (status === 'error') {
    icon = <AlertTriangle size={14} aria-hidden="true" />;
    label = 'Sync error';
    tone = 'text-rose-500';
  } else {
    label = lastSyncedAt ? `Synced ${formatRelative(lastSyncedAt, now)}` : 'Not synced';
  }

  return (
    <button
      type="button"
      onClick={() => { void syncNow(); }}
      aria-label="Sync state — click to sync now"
      title={pendingCount > 0 ? `${pendingCount} unsynced change${pendingCount === 1 ? '' : 's'}` : 'Sync now'}
      className={[
        'hidden lg:flex items-center gap-1.5 px-2 h-8 rounded-md text-xs font-medium',
        'hover:bg-surface-3 transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        tone,
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
