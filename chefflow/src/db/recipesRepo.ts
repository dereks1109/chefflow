import { db } from './dexie';
import type { Recipe } from '../core/types';
import { requireCurrentUserId } from '../state/currentUser';

export async function listRecipes(): Promise<Recipe[]> {
  const userId = requireCurrentUserId();
  const all = await db.recipes.where('ownerId').equals(userId).toArray();
  const live = all.filter((r) => !r.deletedAt);
  live.sort((a, b) => b.updatedAt - a.updatedAt);
  return live.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const userId = requireCurrentUserId();
  const r = await db.recipes.get(id);
  if (!r || r.ownerId !== userId || r.deletedAt) return undefined;
  return r;
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  const userId = requireCurrentUserId();
  await db.recipes.put({
    ...recipe,
    ownerId: userId,
    updatedAt: Date.now(),
    dirty: true,
  });
}

// Soft delete — flips deletedAt so the row can propagate to the server as
// a tombstone. listRecipes/getRecipe filter these out, so the UI sees the
// same effect as a hard delete.
export async function deleteRecipe(id: string): Promise<void> {
  const userId = requireCurrentUserId();
  const r = await db.recipes.get(id);
  if (!r || r.ownerId !== userId) return;
  const now = Date.now();
  await db.recipes.put({
    ...r,
    deletedAt: now,
    updatedAt: now,
    dirty: true,
  });
}
