import { db } from './dexie';
import type { UserPrefs, UnitSystem } from '../core/types';
import { requireCurrentUserId } from '../state/currentUser';

// One prefs row per user. Sync uses the same LWW logic as recipes/events
// (the row's id == ownerId so the existing single-table sync layer works).
//
// Returns undefined when the user has no row yet — caller decides whether
// to seed from localStorage or use defaults.
export async function getPrefs(): Promise<UserPrefs | undefined> {
  const userId = requireCurrentUserId();
  const row = await db.userPrefs.get(userId);
  if (!row || row.ownerId !== userId || row.deletedAt) return undefined;
  return row;
}

export async function savePrefs(patch: Partial<Omit<UserPrefs, 'id' | 'ownerId'>>): Promise<UserPrefs> {
  const userId = requireCurrentUserId();
  const existing = await db.userPrefs.get(userId);
  const merged: UserPrefs = {
    id: userId,
    ownerId: userId,
    unitSystem: 'auto',
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    dirty: true,
  };
  await db.userPrefs.put(merged);
  return merged;
}

export async function setUnitSystem(unitSystem: UnitSystem): Promise<void> {
  await savePrefs({ unitSystem });
}
