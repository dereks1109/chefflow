import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;   // epoch ms; null = never
  pendingCount: number;          // dirty rows not yet pushed
  lastError: string | null;
  setStatus: (status: SyncStatus) => void;
  setLastSyncedAt: (ts: number) => void;
  setPendingCount: (n: number) => void;
  setLastError: (msg: string | null) => void;
}

const STORAGE_KEY = 'chefflow:lastSyncedAt';

function readPersistedLastSyncedAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncedAt: readPersistedLastSyncedAt(),
  pendingCount: 0,
  lastError: null,
  setStatus: (status) => set({ status }),
  setLastSyncedAt: (ts) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(ts));
    }
    set({ lastSyncedAt: ts });
  },
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastError: (lastError) => set({ lastError }),
}));
