// First-sign-in adoption: re-stamp any Dexie rows that have either no userId
// or an `anon:*` userId with the new Clerk userId, mark them as unsynced so
// the next push round uploads them, and bump updatedAt so server-side LWW
// applies them cleanly.
//
// Triggered ONCE per Clerk user per browser, gated by the sync store's
// `lastPulledAt === 0` check in SyncRunner.

import { db } from '../../db/dexie';
import { isAnonUserId } from '../auth/getCurrentUserId';
import type { Recipe, KitchenEvent, Menu, AllergenAuditEntry, SyncMeta } from '../types';

interface MigrationResult {
  recipes: number;
  events: number;
  menus: number;
  allergen_audits: number;
  total: number;
}

/**
 * Re-stamp anonymous rows with the given Clerk userId. Returns per-table
 * counts so the caller can surface a "Migrated N recipes" toast.
 *
 * Idempotent: rows with `userId === targetUserId` (already adopted) are
 * skipped. Tombstones (`isDeleted: true`) are adopted just like live rows
 * so the delete propagates on the first push.
 */
export async function migrateAnonRowsForUser(targetUserId: string): Promise<MigrationResult> {
  const now = Date.now();

  const recipes = await reStampTable<Recipe>(db.recipes, targetUserId, now);
  const events = await reStampTable<KitchenEvent>(db.events, targetUserId, now);
  const menus = await reStampTable<Menu>(db.menus, targetUserId, now);
  const audits = await reStampTable<AllergenAuditEntry>(
    db.allergenAudits as unknown as import('dexie').Table<AllergenAuditEntry, string>,
    targetUserId,
    now,
  );

  return {
    recipes,
    events,
    menus,
    allergen_audits: audits,
    total: recipes + events + menus + audits,
  };
}

async function reStampTable<T extends SyncMeta & { id: string }>(
  table: import('dexie').Table<T, string>,
  targetUserId: string,
  now: number,
): Promise<number> {
  const all = await table.toArray();
  const toMigrate = all.filter((r) => isAnonUserId(r.userId));
  if (toMigrate.length === 0) return 0;

  for (const row of toMigrate) {
    const next = {
      ...row,
      userId: targetUserId,
      // Bump updatedAt so the server's LWW guard treats this push as newer
      // than any (unlikely) pre-existing row under the new userId.
      // AllergenAuditEntry uses `removedAt` instead — leave that alone, it
      // describes the historical event, not the migration timestamp.
      ...('updatedAt' in row ? { updatedAt: now } : {}),
      synced: false,
    } as T;
    // For allergen audits, also stamp userClerkId so the legacy bespoke
    // endpoint sees the new identity. The cast keeps this type-safe across
    // the four entity types.
    if ('userClerkId' in (next as object)) {
      (next as unknown as { userClerkId?: string }).userClerkId = targetUserId;
    }
    await table.put(next);
  }
  return toMigrate.length;
}
