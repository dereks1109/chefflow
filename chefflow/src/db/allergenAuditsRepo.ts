import { db } from './dexie';
import { getCurrentUserId } from '../core/auth/getCurrentUserId';
import type { AllergenAuditEntry } from '../core/types';

// The audit log was already half-synced via the bespoke /audit/allergen-removal
// endpoint. The new D1 sync engine generalises that for ALL Dexie stores; the
// repo here joins the same shape used by recipesRepo / eventsRepo / menusRepo.
// `synced` already existed on the entry — the sync engine reuses it.

export async function addEntry(entry: AllergenAuditEntry): Promise<void> {
  const userId = getCurrentUserId();
  await db.allergenAudits.put({
    ...entry,
    userId: entry.userId ?? userId,
    // Keep the historical userClerkId field in sync with userId so the
    // legacy bespoke endpoint sees the same identity.
    userClerkId: entry.userClerkId ?? userId,
    synced: false,
  });
}

export async function listByRecipe(recipeId: string): Promise<AllergenAuditEntry[]> {
  const userId = getCurrentUserId();
  // Same visibility rule as the other repos: rows for the current user OR
  // legacy rows with no userId set. Recipe-id filter narrows down further.
  const all = await db.allergenAudits.where('recipeId').equals(recipeId).toArray();
  return all
    .filter((e) => !e.isDeleted && (!e.userId || e.userId === userId))
    .sort((a, b) => b.removedAt - a.removedAt);
}

/** Flip the `synced` flag on a previously-stored entry. No-op if absent. */
export async function markSynced(id: string): Promise<void> {
  const existing = await db.allergenAudits.get(id);
  if (!existing) return;
  await db.allergenAudits.put({ ...existing, synced: true });
}

/** Local-only audit rows that have a userId attached but haven't been pushed
 *  to the central worker log yet. Used by the editor's backfill effect to
 *  retry stale entries on each open. */
export async function listUnsyncedForRecipe(recipeId: string): Promise<AllergenAuditEntry[]> {
  const userId = getCurrentUserId();
  const all = await db.allergenAudits.where('recipeId').equals(recipeId).toArray();
  // The historical `userClerkId` check stays — anonymous removals never get
  // pushed (they have no user identity to attach to the server log).
  return all.filter((e) =>
    !e.synced && !!e.userClerkId && (!e.userId || e.userId === userId),
  );
}
