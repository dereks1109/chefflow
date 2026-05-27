import { describe, it, expect, vi } from 'vitest';
import { provisionDemosForUser } from './demos';

// In-memory stub of (user_id, id) → row. Mimics the SQL surface demos.ts
// uses:
//   - SELECT payload FROM recipes WHERE user_id = ? AND id = ? AND is_deleted = 0
//   - UPDATE recipes SET is_deleted = 1, updated_at = ? WHERE user_id = ? AND id = ? AND is_deleted = 0
//   - UPDATE recipes SET payload = ?, updated_at = ? WHERE user_id = ? AND id = ?
//   - INSERT OR IGNORE INTO <table> (id, user_id, updated_at, is_deleted, payload) VALUES (?,?,?,0,?)
//   - INSERT INTO <table> … ON CONFLICT … DO UPDATE
function makeStubDb() {
  type Row = { id: string; user_id: string; updated_at: number; is_deleted: number; payload: string };
  const rows = new Map<string, Row>();
  const key = (table: string, userId: string, id: string) => `${table}::${userId}::${id}`;

  const db = {
    prepare: (sql: string) => {
      let params: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) { params = args; return stmt; },

        async first<T = unknown>() {
          // SELECT payload FROM recipes WHERE user_id = ? AND id = ? AND is_deleted = 0
          if (/^SELECT payload FROM recipes/i.test(sql)) {
            const [userId, id] = params as [string, string];
            const row = rows.get(key('recipes', userId, id));
            if (!row || row.is_deleted) return null;
            return { payload: row.payload } as unknown as T;
          }
          return null;
        },

        async run() {
          // Tombstone UPDATE.
          if (/^UPDATE recipes\s+SET is_deleted = 1/i.test(sql)) {
            const [updatedAt, userId, id] = params as [number, string, string];
            const k = key('recipes', userId, id);
            const existing = rows.get(k);
            if (!existing || existing.is_deleted) return { success: true, meta: { changes: 0 } };
            rows.set(k, { ...existing, is_deleted: 1, updated_at: updatedAt });
            return { success: true, meta: { changes: 1 } };
          }

          // Allergen-strip UPDATE.
          if (/^UPDATE recipes SET payload = \?/i.test(sql)) {
            const [payload, updatedAt, userId, id] = params as [string, number, string, string];
            const k = key('recipes', userId, id);
            const existing = rows.get(k);
            if (!existing) return { success: true, meta: { changes: 0 } };
            rows.set(k, { ...existing, payload, updated_at: updatedAt });
            return { success: true, meta: { changes: 1 } };
          }

          // INSERT OR IGNORE.
          const ignoreMatch = sql.match(/INSERT OR IGNORE INTO (\w+)/);
          // INSERT ... ON CONFLICT DO UPDATE (upsert).
          const upsertMatch = sql.match(/INSERT INTO (\w+)[\s\S]*ON CONFLICT/);
          const isUpsert = Boolean(upsertMatch);
          const table = ignoreMatch?.[1] ?? upsertMatch?.[1] ?? '';
          if (!table) return { success: true, meta: { changes: 0 } };

          const [id, userId, updatedAt, payload] = params as [string, string, number, string];
          const k = key(table, userId, id);
          const existing = rows.get(k);
          if (existing && !isUpsert) {
            return { success: true, meta: { changes: 0 } };
          }
          rows.set(k, { id, user_id: userId, updated_at: updatedAt, is_deleted: 0, payload });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;

  return { db, rows };
}

function makeStubKv() {
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    delete: vi.fn(async (k: string) => { store.delete(k); }),
  } as unknown as KVNamespace;
  return { kv, store };
}

describe('provisionDemosForUser', () => {
  it('first call provisions all 14 active demo recipes + the demo event under the caller user_id', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    const out = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(out.alreadyProvisioned).toBe(false);
    expect(out.recipesInserted).toBe(14);
    expect(out.eventsInserted).toBe(1);
    expect(out.recipesTombstoned).toBe(0); // brand-new user — nothing to tombstone
    expect(out.recipesUpdated).toBe(0);     // brand-new user — nothing to strip

    const userIds = new Set(Array.from(rows.values()).map((r) => r.user_id));
    expect(userIds).toEqual(new Set(['user_alice']));

    // Sanity: a known active demo id is present; the retired mango sorbet is NOT.
    expect(Array.from(rows.values()).some((r) => r.id === 'r_demo_ribeye')).toBe(true);
    expect(Array.from(rows.values()).some((r) => r.id === 'r_demo_mango_sorbet')).toBe(false);
    expect(Array.from(rows.values()).some((r) => r.id === 'e_demo_main')).toBe(true);
  });

  it('second call is a no-op (KV v5 marker fast-skips)', async () => {
    const { db } = makeStubDb();
    const { kv, store } = makeStubKv();
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(store.get('demos:provisioned:v5:user_alice')).toBe('1');
    const second = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(second.alreadyProvisioned).toBe(true);
    expect(second.recipesInserted).toBe(0);
    expect(second.eventsInserted).toBe(0);
    expect(second.recipesTombstoned).toBe(0);
    expect(second.recipesUpdated).toBe(0);
  });

  it('INSERT OR IGNORE preserves an existing recipe with the same id (chef customisation survives)', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    rows.set('recipes::user_alice::r_demo_ribeye', {
      id: 'r_demo_ribeye',
      user_id: 'user_alice',
      updated_at: 1000,
      is_deleted: 0,
      payload: JSON.stringify({ id: 'r_demo_ribeye', title: 'My Custom Ribeye' }),
    });
    const out = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    // 14 active demos, one already existed → 13 inserts.
    expect(out.recipesInserted).toBe(13);
    const ribeye = rows.get('recipes::user_alice::r_demo_ribeye');
    expect(ribeye?.payload).toContain('My Custom Ribeye');
  });

  it('each user gets their own private copy (cross-user isolation)', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_bob');
    const userIds = Array.from(rows.values()).map((r) => r.user_id);
    expect(userIds.filter((u) => u === 'user_alice').length).toBe(15); // 14 recipes + 1 event
    expect(userIds.filter((u) => u === 'user_bob').length).toBe(15);
  });

  it('v2-marker users get re-provisioned for v5: mango sorbet tombstoned, allergens stripped from existing demos', async () => {
    const { db, rows } = makeStubDb();
    const { kv, store } = makeStubKv();
    // Pre-seed the v2 marker (chef was provisioned in the previous version).
    store.set('demos:provisioned:v2:user_alice', '1');
    // Pre-seed a mango sorbet row (active) that should get tombstoned.
    rows.set('recipes::user_alice::r_demo_mango_sorbet', {
      id: 'r_demo_mango_sorbet',
      user_id: 'user_alice',
      updated_at: 1000,
      is_deleted: 0,
      payload: JSON.stringify({ id: 'r_demo_mango_sorbet', title: '(Demo) Mango Sorbet' }),
    });
    // Pre-seed a ribeye with v2-era allergens that should get stripped.
    rows.set('recipes::user_alice::r_demo_ribeye', {
      id: 'r_demo_ribeye',
      user_id: 'user_alice',
      updated_at: 1000,
      is_deleted: 0,
      payload: JSON.stringify({
        id: 'r_demo_ribeye',
        title: '(Demo) Ribeye',
        ingredients: [
          { id: 'i1', name: 'Butter', allergenFlags: ['milk'] },
          { id: 'i2', name: 'Beef' },
        ],
        analysis: { caloriesPerPortion: 880, allergens: ['milk'], uncertainIngredients: ['xyz'] },
      }),
    });

    const out = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(out.alreadyProvisioned).toBe(false);
    expect(out.recipesTombstoned).toBe(1);
    expect(out.recipesUpdated).toBe(1);
    // V3 marker is now set.
    expect(store.get('demos:provisioned:v5:user_alice')).toBe('1');

    // Mango sorbet → tombstoned.
    const mango = rows.get('recipes::user_alice::r_demo_mango_sorbet');
    expect(mango?.is_deleted).toBe(1);

    // Ribeye → allergens + uncertainIngredients + ingredient.allergenFlags wiped,
    // other fields preserved.
    const ribeye = rows.get('recipes::user_alice::r_demo_ribeye');
    const parsed = JSON.parse(ribeye!.payload) as {
      title: string;
      ingredients: Array<{ name: string; allergenFlags?: unknown }>;
      analysis: { caloriesPerPortion: number; allergens?: unknown; uncertainIngredients?: unknown };
    };
    expect(parsed.title).toBe('(Demo) Ribeye');
    expect(parsed.analysis.caloriesPerPortion).toBe(880);
    expect(parsed.analysis.allergens).toBeUndefined();
    expect(parsed.analysis.uncertainIngredients).toBeUndefined();
    expect(parsed.ingredients[0].allergenFlags).toBeUndefined();
  });

  it('cleanup is a no-op on fields that are already clean (idempotent if run twice somehow)', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    // Pre-seed a ribeye with NO allergens / NO allergenFlags — already clean.
    rows.set('recipes::user_alice::r_demo_ribeye', {
      id: 'r_demo_ribeye',
      user_id: 'user_alice',
      updated_at: 1000,
      is_deleted: 0,
      payload: JSON.stringify({
        id: 'r_demo_ribeye',
        title: '(Demo) Ribeye',
        ingredients: [{ id: 'i1', name: 'Butter' }],
        analysis: { caloriesPerPortion: 880, keyIngredientTags: ['beef'] },
      }),
    });
    const out = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    // Already clean → no UPDATE issued for ribeye.
    expect(out.recipesUpdated).toBe(0);
  });

  it('the demo event row UPSERTS over a stale payload — chef sees the new £600 budget + 5 dishes', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    rows.set('events::user_alice::e_demo_main', {
      id: 'e_demo_main',
      user_id: 'user_alice',
      updated_at: 1000,
      is_deleted: 0,
      payload: JSON.stringify({ id: 'e_demo_main', title: 'Demo Event', budget: 50, dishes: [], sections: [] }),
    });
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    const updated = rows.get('events::user_alice::e_demo_main');
    expect(updated).toBeDefined();
    const payload = JSON.parse(updated!.payload) as {
      budget: number;
      dishes: Array<{ recipeId: string }>;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
    };
    expect(payload.budget).toBe(600);
    expect(payload.dishes.length).toBe(5);
    expect(payload.dishes.map((d) => d.recipeId)).toEqual(
      expect.arrayContaining([
        'r_demo_salad', 'r_demo_calamari', 'r_demo_tikka_masala', 'r_demo_lamb_rack', 'r_demo_ribeye',
      ]),
    );
    // v4 demo contact upgrade: client name + email + phone are present so
    // the demo event shows what a complete booking record looks like.
    expect(payload.contactName).toBe('Priscilla Morgan');
    expect(payload.contactEmail).toBe('priscilla.morgan@example.com');
    expect(payload.contactPhone).toBe('+44 7700 900456');
  });

  it('v5 demo event ships a notesOriginal email so the hover-provenance demo works out-of-the-box', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    const eventRow = rows.get('events::user_alice::e_demo_main');
    expect(eventRow).toBeDefined();
    const payload = JSON.parse(eventRow!.payload) as { notes: string; notesOriginal: string };
    expect(typeof payload.notesOriginal).toBe('string');
    // The raw email mentions key details the parsed notes also reference,
    // so the popover can highlight matches.
    expect(payload.notesOriginal).toContain('peanut allergy');
    expect(payload.notesOriginal).toContain('vegetarian');
    expect(payload.notesOriginal).toContain('£600');
    // Long-form prose (not the bullet-list shape).
    expect(payload.notesOriginal.length).toBeGreaterThan(payload.notes.length);
  });
});
