import Dexie, { type Table } from 'dexie';
import type { Recipe, KitchenEvent, UserPrefs } from '../core/types';

// Sentinel ownerId assigned to legacy rows during the v4 migration. The
// first signed-in user post-upgrade claims these via claimLegacyRows() in
// the bootstrap effect, so chefs who used the app pre-auth don't lose data.
export const LEGACY_OWNER = '__legacy__';

class ChefFlowDB extends Dexie {
  recipes!: Table<Recipe, string>;
  events!: Table<KitchenEvent, string>;
  userPrefs!: Table<UserPrefs, string>;

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
    // v4: add ownerId for per-user isolation + deletedAt/serverVersion/dirty
    // for cloud sync. Backfill ownerId on existing rows to LEGACY_OWNER so
    // the first sign-in can claim them. The compound [ownerId+updatedAt]
    // indexes back listRecipes/listEvents per-user queries efficiently.
    this.version(4).stores({
      recipes: 'id, ownerId, updatedAt, title, [ownerId+updatedAt]',
      events: 'id, ownerId, updatedAt, title, serveAt, [ownerId+updatedAt]',
    }).upgrade(async (tx) => {
      await tx.table('recipes').toCollection().modify((row: Record<string, unknown>) => {
        if (!row.ownerId) row.ownerId = LEGACY_OWNER;
        if (row.serverVersion === undefined) row.serverVersion = 0;
        if (row.dirty === undefined) row.dirty = true;
      });
      await tx.table('events').toCollection().modify((row: Record<string, unknown>) => {
        if (!row.ownerId) row.ownerId = LEGACY_OWNER;
        if (row.serverVersion === undefined) row.serverVersion = 0;
        if (row.dirty === undefined) row.dirty = true;
      });
    });
    // v5: per-user preferences (unit system) — a single row per user, keyed
    // by the user's id so the sync layer can reuse the same row schema as
    // recipes/events. Settings the chef would expect to follow them across
    // devices go here; sensitive (API keys) and device-specific (theme) ones
    // stay in localStorage.
    this.version(5).stores({
      recipes: 'id, ownerId, updatedAt, title, [ownerId+updatedAt]',
      events: 'id, ownerId, updatedAt, title, serveAt, [ownerId+updatedAt]',
      userPrefs: 'id, ownerId, updatedAt',
    });
  }
}

export const db = new ChefFlowDB();

// One-shot claim: rewrite legacy rows (ownerId='__legacy__') to the given
// userId so a chef's pre-auth work follows them once they sign in. Gated by
// a per-user localStorage flag so it only runs once per (browser, user).
const CLAIM_FLAG_PREFIX = 'chefflow:claimed-legacy:';

export async function claimLegacyRows(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const flagKey = `${CLAIM_FLAG_PREFIX}${userId}`;
  if (window.localStorage.getItem(flagKey) === '1') return;
  await db.transaction('rw', db.recipes, db.events, async () => {
    await db.recipes.where('ownerId').equals(LEGACY_OWNER).modify({ ownerId: userId, dirty: true });
    await db.events.where('ownerId').equals(LEGACY_OWNER).modify({ ownerId: userId, dirty: true });
  });
  window.localStorage.setItem(flagKey, '1');
}
