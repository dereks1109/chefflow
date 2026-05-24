// Glue between the in-memory unitSystemStore (Zustand + localStorage cache)
// and the Dexie userPrefs row that syncClient pushes to Cloudflare. Sign-in
// flow: load Dexie pref (if any) into the store; on first sign-in without a
// row, seed Dexie from the store's current value so it gets pushed.
// Runtime: subscribe to store changes and persist them to Dexie (marked
// dirty) so the next sync push carries them.

import { useUnitSystemStore } from './unitSystemStore';
import { getPrefs, setUnitSystem } from '../db/prefsRepo';

let unsubscribe: (() => void) | null = null;
// Suppresses the Dexie write when the change came from a pull (we just
// applied the server's value to the store; writing it back as dirty would
// bounce it to the server on the next push).
let suppressNext = false;

export function applyPulledUnitSystemToStore(): void {
  // No-op placeholder — syncClient writes the store directly. Exists for
  // symmetry / future room to take the pulled value as an argument.
}

// Marks the next setState as a server-originated update so the subscribe
// handler doesn't echo it back.
export function suppressNextWrite(): void {
  suppressNext = true;
}

/**
 * Load the user's prefs row from Dexie into the in-memory store (if it
 * exists), and subscribe to in-memory changes so they persist to Dexie
 * as dirty rows for the next sync push.
 *
 * Called from App.tsx after sign-in. Returns a cleanup function to call on
 * sign-out so the subscription doesn't leak across sessions.
 */
export async function startPrefsSync(): Promise<() => void> {
  // Tear down any previous subscription (sign-in after a sign-out).
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  const stored = await getPrefs();
  if (stored) {
    // Set BEFORE subscribing so the load doesn't fire the listener and
    // bounce the loaded value back to Dexie. No suppressNext flag needed
    // because there's no subscriber yet.
    useUnitSystemStore.setState({ system: stored.unitSystem });
  } else {
    // No row yet — seed Dexie from the store's current value so it gets
    // pushed up on the next sync. This is how a chef's existing
    // localStorage pref migrates into the cloud the first time they sign
    // in post-upgrade.
    const current = useUnitSystemStore.getState().system;
    await setUnitSystem(current);
  }

  unsubscribe = useUnitSystemStore.subscribe((state, prev) => {
    if (suppressNext) {
      suppressNext = false;
      return;
    }
    if (state.system === prev.system) return;
    void setUnitSystem(state.system);
  });

  return () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}
