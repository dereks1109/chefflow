import Dexie, { type Table } from 'dexie';
import type { Recipe, KitchenEvent, Menu, AllergenAuditEntry } from '../core/types';

class ChefFlowDB extends Dexie {
  recipes!: Table<Recipe, string>;
  events!: Table<KitchenEvent, string>;
  menus!: Table<Menu, string>;
  allergenAudits!: Table<AllergenAuditEntry, string>;

  constructor() {
    super('chefflow');
    this.version(1).stores({
      recipes: 'id, updatedAt, title',
    });
    this.version(2).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
    });
    // v3: events.sessions[] removed, replaced by events.dishes[]. Migrate
    // any in-flight rows so we don't lose data created during the brief
    // window when sessions were the model.
    this.version(3).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
    }).upgrade((tx) =>
      tx.table('events').toCollection().modify((event: Record<string, unknown>) => {
        const oldSessions = event.sessions as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(oldSessions) && !event.dishes) {
          event.dishes = oldSessions.map((s) => ({
            id: s.id,
            name: s.title ?? '',
            portions: 1,
            startAt: s.startAt ?? new Date().toISOString(),
            notes: s.notes || undefined,
          }));
        }
        if (!event.dishes) event.dishes = [];
        delete event.sessions;
      })
    );
    // v4: menus table — named collections of recipeIds. Standalone from
    // events; no migration needed since this is a brand-new store.
    this.version(4).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
      menus: 'id, updatedAt, title',
    });
    // v5: shape change to recipes — Ingredient gained an optional
    // `componentRecipeId` field for the `#` sub-recipe reference feature
    // (see chefflow/src/core/recipes/flattenSubRecipes.ts). Field is
    // optional + nested, so this is a no-op upgrader documenting the
    // boundary. No new index added — the only cross-reference query
    // (RecipesLibrary's "used in N" badge) is fast enough as an in-memory
    // O(R×I) scan at current scale (<1k recipes × <20 ingredients each).
    // If recipe lists grow past ~5k, add a multi-entry index here:
    //   recipes: 'id, updatedAt, title, *ingredients.componentRecipeId'
    this.version(5).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
      menus: 'id, updatedAt, title',
    });
    // v6: allergenAudits table — one row per allergen-tag removal. Indexes
    // recipeId + removedAt so the per-recipe history view can list entries
    // newest-first without an in-memory sort scan. Safety/liability backbone:
    // tags only get patched out after an entry persists here (see
    // AnalysisSection.removeAllergen).
    this.version(6).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
      menus: 'id, updatedAt, title',
      allergenAudits: 'id, recipeId, removedAt',
    });
    // v7: cloud-sync support. Every table gains compound indices keyed by
    // `userId`. Repos filter every read via `[userId+...]` lookups so two
    // Clerk users sharing the same browser cannot see each other's rows.
    // Existing rows have `userId === undefined` — they're treated as
    // "anonymous" until the first-sign-in migration re-stamps them with
    // the Clerk subject and pushes them to D1.
    // `synced` (boolean) is the push queue: writes flip it to false, the
    // sync engine flips it true once the server confirms an applied LWW.
    // `isDeleted` is a soft-delete tombstone — listings filter it out but
    // the row is kept locally so a future server pull doesn't resurrect it.
    this.version(7).stores({
      recipes: 'id, userId, [userId+updatedAt], [userId+title], updatedAt, title, synced',
      events: 'id, userId, [userId+updatedAt], [userId+serveAt], updatedAt, title, serveAt, synced',
      menus: 'id, userId, [userId+updatedAt], updatedAt, title, synced',
      allergenAudits: 'id, userId, [userId+removedAt], [userId+recipeId], recipeId, removedAt, synced',
    });
  }
}

export const db = new ChefFlowDB();
