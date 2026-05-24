// Mounts the sync engine for the signed-in user. Re-mounts (via the keyed
// component) when the Clerk user id changes — fresh sync cursor per user.
//
// First-sign-in migration: on mount, if the store's lastPulledAt is 0
// (meaning we've never pulled for this user on this browser), run
// `migrateAnonRowsForUser` first so any local-only anonymous rows are
// adopted by the Clerk userId before the first push.

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { runSync, registerSyncTriggers } from '../../core/sync/syncEngine';
import { createSyncStoreForUser } from '../../state/useSyncStore';
import { migrateAnonRowsForUser } from '../../core/sync/migrateAnonRows';
import { provisionDemos } from '../../core/demos/provisionClient';

function SyncRunnerInner({ userId }: { userId: string }) {
  // Per-user store: signing out + back in as a different user gets a fresh
  // cursor via the localStorage key.
  const [storeHook] = useState(() => createSyncStoreForUser(userId));
  const store = storeHook();

  useEffect(() => {
    let cancelled = false;
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
      try {
        await provisionDemos();
      } catch {
        // Network or auth blip: try again next time. Don't block sync.
      }

      if (cancelled) return;
      const runOnce = () => {
        void runSync({ store });
      };
      runOnce(); // boot pull/push.
      unsubscribe = registerSyncTriggers(runOnce);
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // Eslint: store is stable across renders (created once via useState init).
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
