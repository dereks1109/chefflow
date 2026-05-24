import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { getPrefs, savePrefs, setUnitSystem } from './prefsRepo';
import { setCurrentUserId } from '../state/currentUser';

const TEST_USER = 'user_prefs_test';

beforeEach(async () => {
  await db.userPrefs.clear();
  setCurrentUserId(TEST_USER);
});

describe('prefsRepo', () => {
  it('returns undefined when no row exists', async () => {
    expect(await getPrefs()).toBeUndefined();
  });

  it('savePrefs creates a row with id == ownerId, dirty=true', async () => {
    const row = await savePrefs({ unitSystem: 'metric' });
    expect(row.id).toBe(TEST_USER);
    expect(row.ownerId).toBe(TEST_USER);
    expect(row.unitSystem).toBe('metric');
    expect(row.dirty).toBe(true);
    expect(row.updatedAt).toBeGreaterThan(0);
  });

  it('savePrefs merges with an existing row', async () => {
    await savePrefs({ unitSystem: 'metric' });
    const updated = await savePrefs({ unitSystem: 'imperial' });
    expect(updated.unitSystem).toBe('imperial');
    const all = await db.userPrefs.toArray();
    expect(all).toHaveLength(1);
  });

  it('setUnitSystem is shorthand for savePrefs', async () => {
    await setUnitSystem('imperial');
    const row = await getPrefs();
    expect(row?.unitSystem).toBe('imperial');
  });

  it('isolates by ownerId — userA cannot read userB prefs', async () => {
    setCurrentUserId('userA');
    await setUnitSystem('metric');
    setCurrentUserId('userB');
    expect(await getPrefs()).toBeUndefined();
    await setUnitSystem('imperial');

    setCurrentUserId('userA');
    expect((await getPrefs())?.unitSystem).toBe('metric');
    setCurrentUserId('userB');
    expect((await getPrefs())?.unitSystem).toBe('imperial');
  });
});
