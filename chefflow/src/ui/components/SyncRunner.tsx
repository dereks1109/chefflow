// Mounts the sync engine for the signed-in user. Re-mounts (via the keyed
// component) when the Clerk user id changes — fresh sync cursor per user.
//
// First-sign-in migration: on mount, if the store's lastPulledAt is 0
// (meaning we've never pulled for this user on this browser), run
// `migrateAnonRowsForUser` first so any local-only anonymous rows are
// adopted by the Clerk userId before the first push.

import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { runSync, registerSyncTriggers } from '../../core/sync/syncEngine';
import { useSyncStore } from '../../state/useSyncStore';
import { migrateAnonRowsForUser } from '../../core/sync/migrateAnonRows';
import { provisionDemos } from '../../core/demos/provisionClient';

// Bounded retry with exponential backoff. Survives the first-sign-in race
// where Clerk's session populates ~milliseconds after the user hook reports
// `isLoaded`. Total wait <= 7s; on final failure logs to console (silent
// failure here was Bug #1 — users saw empty libraries forever).
async function provisionWithRetry(
  getToken: () => Promise<string | null>,
  signal: { cancelled: boolean },
): Promise<void> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (signal.cancelled) return;
    try {
      await provisionDemos({ getToken });
      return;
    } catch (err) {
      if (attempt === delays.length - 1) {
        console.error('[provisionDemos] failed after retries:', err);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

function SyncRunnerInner({ userId }: { userId: string }) {
  const { getToken } = useAuth();

  useEffect(() => {
    // Scope the singleton store to this user. Resets cursor + status if the
    // previous owner was a different user (or anon).
    useSyncStore.getState().switchToUser(userId);
    const store = useSyncStore.getState();

    const signal = { cancelled: false };
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      // First-sign-in adoption — runs once per browser per Clerk user, gated
      // by `lastPulledAt === 0`. After the first successful pull this
      // becomes a no-op.
      if (store.lastPulledAt === 0) {
        try {
          await migrateAnonRowsForUser(userId);
        } catch {
          // Migration errors don't block sync — the rows will eventually
          // get re-stamped on the next anon row encounter.
        }
      }
      // Demo provisioning runs on EVERY mount, not just first-sign-in —
      // existing users (lastPulledAt > 0 from prior sessions) need backfill
      // too. Worker is idempotent via a KV marker (`demos:provisioned:
      // <userId>`) so the repeat HTTP cost is a single KV read. Runs
      // BEFORE the first sync round so demo rows land in D1 and get pulled
      // down on the same boot.
      await provisionWithRetry(getToken, signal);

      if (signal.cancelled) return;
      const runOnce = () => {
        void runSync({ store: useSyncStore.getState() });
      };
      runOnce(); // boot pull/push.
      unsubscribe = registerSyncTriggers(runOnce);
    })();

    return () => {
      signal.cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // getToken from useAuth() is referentially stable across Clerk renders;
    // the singleton store has no React identity to track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return null;
}

/**
 * Top-level mount. Reads the current Clerk user; keys the inner runner by
 * userId so a user switch tears down + remounts (fresh cursor, fresh state).
 * Returns null when signed-out — anon users don't sync.
 */
export default function SyncRunner() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return null;
  if (!user?.id) return null;
  return <SyncRunnerInner key={user.id} userId={user.id} />;
}
