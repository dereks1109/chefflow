import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Singleton sync store. Holds the cursor + live status that the UI surfaces
// via SyncStatusBadge. SyncRunner is the single writer; the badge is the
// reader. On user switch (sign out + sign-in-as-different-user), SyncRunner
// calls `switchToUser(newUserId)` which resets the cursor + state. That
// re-pull-from-zero costs bandwidth once per user switch but keeps cursor
// isolation across users on the same browser.

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  /** Owner of the current cursor. Drives the reset-on-switch behaviour. */
  ownerId: string | null;
  /** Server clock at the last successful pull. 0 means "never pulled". */
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
  /** Switch the active user. If the new userId differs, reset cursor + status. */
  switchToUser: (userId: string) => void;
  /** Wipe everything — used on sign-out. */
  reset: () => void;
}

const STORAGE_KEY = 'chefflow:sync:v2';

const INITIAL: Pick<SyncState, 'ownerId' | 'lastPulledAt' | 'lastPushedAt' | 'status' | 'lastError'> = {
  ownerId: null,
  lastPulledAt: 0,
  lastPushedAt: 0,
  status: 'idle',
  lastError: null,
};

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setLastPulledAt: (lastPulledAt) => set({ lastPulledAt }),
      setLastPushedAt: (lastPushedAt) => set({ lastPushedAt }),
      setStatus: (status) => set({ status }),
      setLastError: (lastError) => set({ lastError }),
      switchToUser: (userId) =>
        set((state) =>
          state.ownerId === userId ? state : { ...INITIAL, ownerId: userId },
        ),
      reset: () => set({ ...INITIAL }),
    }),
    { name: STORAGE_KEY },
  ),
);

/**
 * Compatibility shim. Tests previously called `createSyncStoreForUser` to
 * get a fresh per-user store. With the singleton model, callers should call
 * `useSyncStore.getState().switchToUser(userId)` to scope the singleton to
 * that user.
 *
 * Kept as a thin wrapper so the SyncRunner refactor stays focused.
 */
export function createSyncStoreForUser(userId: string) {
  useSyncStore.getState().switchToUser(userId);
  return () => useSyncStore.getState();
}
