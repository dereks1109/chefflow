import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Per-user sync cursor + status. The store key includes the Clerk userId so
// different users on the same browser don't share cursors. Pre-sign-in we
// use an `:anon` suffix (no-op since the sync engine doesn't run for anon).

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  /** Server clock at the last successful pull. Used as the `since` cursor
   *  for the next pull. 0 means "never pulled" — first pull fetches all rows. */
  lastPulledAt: number;
  /** Wall-clock at the last successful push round-trip. Display only. */
  lastPushedAt: number;
  status: SyncStatus;
  /** Last error message; cleared on next successful sync. */
  lastError: string | null;

  setLastPulledAt: (next: number) => void;
  setLastPushedAt: (next: number) => void;
  setStatus: (next: SyncStatus) => void;
  setLastError: (next: string | null) => void;
  reset: () => void;
}

const STORAGE_PREFIX = 'chefflow:sync:v1';

/**
 * Per-userId Zustand persist key. Pre-sign-in, multiple anon ids in one
 * browser keep separate cursors — but the sync engine only runs for
 * signed-in users, so anon cursors stay at 0 forever.
 */
function storageKeyFor(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

/**
 * Build a sync store scoped to the given Clerk userId. Different users on the
 * same browser get independent stores via different localStorage keys.
 *
 * Implementation note: zustand-persist normally takes a static `name`, so we
 * keep one canonical hook (`useSyncStore`) for the rendered UI but expose
 * `createSyncStoreForUser` for tests + per-user cursor resets.
 */
export function createSyncStoreForUser(userId: string) {
  return create<SyncState>()(
    persist(
      (set) => ({
        lastPulledAt: 0,
        lastPushedAt: 0,
        status: 'idle' as SyncStatus,
        lastError: null,
        setLastPulledAt: (lastPulledAt) => set({ lastPulledAt }),
        setLastPushedAt: (lastPushedAt) => set({ lastPushedAt }),
        setStatus: (status) => set({ status }),
        setLastError: (lastError) => set({ lastError }),
        reset: () =>
          set({ lastPulledAt: 0, lastPushedAt: 0, status: 'idle', lastError: null }),
      }),
      { name: storageKeyFor(userId) },
    ),
  );
}

/**
 * Default singleton — used by the SyncRunner component. The persist key
 * encodes the userId at render time so a sign-out + sign-in-as-another-user
 * reads the right cursor. Implementation: re-create the store when userId
 * changes (handled in SyncRunner via React state keyed by userId).
 */
export const useSyncStore = createSyncStoreForUser('default');

export { storageKeyFor };
