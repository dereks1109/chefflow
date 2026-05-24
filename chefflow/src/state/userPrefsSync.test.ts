import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db/dexie';
import { setCurrentUserId } from './currentUser';
import { useUnitSystemStore } from './unitSystemStore';
import { startPrefsSync, suppressNextWrite } from './userPrefsSync';

const TEST_USER = 'user_prefs_sync_test';

// Each test that calls startPrefsSync MUST register the cleanup here so
// the subscription doesn't leak into the next test's setState calls.
let cleanup: (() => void) | null = null;

beforeEach(async () => {
  await db.userPrefs.clear();
  window.localStorage.clear();
  setCurrentUserId(TEST_USER);
  useUnitSystemStore.setState({ system: 'auto' });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('startPrefsSync', () => {
  it('seeds Dexie from the store when no row exists yet', async () => {
    useUnitSystemStore.setState({ system: 'metric' });
    cleanup = await startPrefsSync();
    const row = await db.userPrefs.get(TEST_USER);
    expect(row?.unitSystem).toBe('metric');
    expect(row?.dirty).toBe(true);
  });

  it('loads the Dexie row into the store on sign-in', async () => {
    // Plant a pre-existing row (e.g. just pulled from the cloud).
    await db.userPrefs.put({
      id: TEST_USER,
      ownerId: TEST_USER,
      unitSystem: 'imperial',
      updatedAt: 1000,
      serverVersion: 100,
      dirty: false,
    });
    cleanup = await startPrefsSync();
    expect(useUnitSystemStore.getState().system).toBe('imperial');
  });

  it('does NOT mark the loaded row dirty (would bounce back to server)', async () => {
    await db.userPrefs.put({
      id: TEST_USER,
      ownerId: TEST_USER,
      unitSystem: 'imperial',
      updatedAt: 1000,
      serverVersion: 100,
      dirty: false,
    });
    cleanup = await startPrefsSync();
    const row = await db.userPrefs.get(TEST_USER);
    expect(row?.dirty).toBe(false);
  });

  it('subscribes — local store changes persist to Dexie as dirty', async () => {
    cleanup = await startPrefsSync();
    useUnitSystemStore.getState().setSystem('metric');
    // Subscription fires synchronously; the savePrefs write is async.
    await new Promise((r) => setTimeout(r, 10));
    const row = await db.userPrefs.get(TEST_USER);
    expect(row?.unitSystem).toBe('metric');
    expect(row?.dirty).toBe(true);
  });

  it('suppressNextWrite — pulled value does not bounce back', async () => {
    cleanup = await startPrefsSync();
    // Simulate a sync pull: server sent imperial; syncClient calls suppress
    // then setState directly on the store.
    suppressNextWrite();
    useUnitSystemStore.setState({ system: 'imperial' });
    await new Promise((r) => setTimeout(r, 10));
    const row = await db.userPrefs.get(TEST_USER);
    // The pre-existing dirty=true row (from seed-from-store on startPrefsSync)
    // is still there, but the new "imperial" value did NOT mark a new dirty
    // write — verify by checking the unitSystem persisted is still the
    // initial seed value (auto), proving the subscription didn't fire.
    // Actually the seed wrote 'auto' as dirty. Let me check by counting
    // calls instead. Simpler: re-init.
    expect(row?.unitSystem).toBe('auto');  // seed wrote 'auto'; suppressed write did NOT overwrite
  });
});
