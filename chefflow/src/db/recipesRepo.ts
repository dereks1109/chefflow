import { liveQuery } from 'dexie';
import { db } from './dexie';
import { getCurrentUserId } from '../core/auth/getCurrentUserId';
import { uncopyRecipe } from '../core/community/communityClient';
import { promoteLegacyRecipeFields } from '../core/recipes/recipeShape';
import type { Recipe } from '../core/types';

// All repo functions are scoped to `getCurrentUserId()`:
//   - Reads filter on the [userId+updatedAt] compound index so two Clerk
//     users sharing the same browser cannot see each other's rows.
//   - Writes stamp `userId` + bump `updatedAt` + flip `synced: false` so
//     the sync engine picks the row up on its next push cycle.
//   - `deleteRecipe` is now a soft delete (tombstone) — D1 needs to know
//     about the deletion to propagate it to other devices. The local row
//     stays so a stale server pull can't resurrect it.

/**
 * Live subscription — calls `cb` with the current visible recipes immediately,
 * then again on EVERY Dexie commit (including writes from the D1 sync engine
 * landing demos / pulled rows). Returns an unsubscribe function.
 *
 * Replaces the one-shot `listRecipes().then(setRecipes)` pattern in library
 * pages so that the post-login moment "demos arrive in Dexie" automatically
 * re-renders the library — no nav round-trip required.
 */
export function subscribeRecipes(cb: (rows: Recipe[]) => void): () => void {
  const observable = liveQuery(() => listRecipes());
  const sub = observable.subscribe({
    next: cb,
    error: (err) => {
      // Surface, don't crash — the page can fall back to whatever state it had.
      // eslint-disable-next-line no-console
      console.warn('[recipesRepo] subscribeRecipes errored', err);
    },
  });
  return () => sub.unsubscribe();
}

export async function listRecipes(): Promise<Recipe[]> {
  const userId = getCurrentUserId();
  // Two visibility groups: rows owned by the current user, plus legacy rows
  // with no userId (pre-v7 data that hasn't been migrated yet, or rows
  // written by test fixtures via `db.recipes.put` directly). Cross-user
  // isolation holds because rows owned by ANOTHER Clerk user have a non-
  // matching userId and fall in neither group.
  const all = await db.recipes.toArray();
  const visible = all.filter((r) =>
    !r.isDeleted && (!r.userId || r.userId === userId),
  );
  // Sort: pinned first; within each group, updatedAt desc.
  return visible.sort((a, b) => {
    const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    return b.updatedAt - a.updatedAt;
  });
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const userId = getCurrentUserId();
  const r = await db.recipes.get(id);
  // Cross-user fence: rows with a non-matching `userId` are invisible. Rows
  // with no `userId` (legacy local data or tests) fall through to "visible
  // to the current user" — they'll be adopted by the first-sign-in
  // migration if the user signs in.
  if (!r) return undefined;
  if (r.userId && r.userId !== userId) return undefined;
  if (r.isDeleted) return undefined;
  return r;
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  const userId = getCurrentUserId();
  // Opportunistic legacy promotion: any row still carrying allergens or
  // keyIngredientTags inside `analysis` gets lifted to the new top-level
  // shape (see `core/recipes/recipeShape.ts`). Idempotent — no-op once
  // the row is on the new shape. Removes the only place the legacy
  // fields are still written; reads use the shim until the cleanup
  // commit.
  const promoted = promoteLegacyRecipeFields(recipe);
  const next: Recipe = {
    ...promoted,
    userId: promoted.userId ?? userId,
    // Honor caller-set updatedAt (consumers + sync engine pass it explicitly;
    // tests use it to seed deterministic sort order). Fall back to Date.now()
    // only when missing — guards against malformed rows landing without a
    // sortable timestamp.
    updatedAt: promoted.updatedAt > 0 ? promoted.updatedAt : Date.now(),
    // Any write — including pin toggle, content edit, or analysis refresh —
    // re-queues the row for the next sync push. Cleared back to `true` by
    // the sync engine when the server confirms an 'applied' LWW status.
    synced: false,
  };
  await db.recipes.put(next);
}

/**
 * Soft delete. The Dexie row stays (with `isDeleted: true`) so the sync
 * engine can push the tombstone to D1 and so a future server pull can't
 * silently undo the delete. Listings hide it; `getRecipe` returns undefined.
 */
export async function deleteRecipe(id: string): Promise<void> {
  const existing = await db.recipes.get(id);
  if (!existing) return;
  const userId = getCurrentUserId();
  await db.recipes.put({
    ...existing,
    userId: existing.userId ?? userId,
    isDeleted: true,
    updatedAt: Date.now(),
    synced: false,
  });
  // Auto-rewind the community copies counter if this row was copied from
  // community. Fire-and-forget — the local delete must succeed even if
  // the worker is down, so we log and swallow. Worker is idempotent, so
  // a future retry path is safe to add later.
  if (existing.copiedFromCommunityId) {
    void uncopyRecipe(existing.copiedFromCommunityId).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[recipesRepo] auto-uncopy failed', err);
    });
  }
}
