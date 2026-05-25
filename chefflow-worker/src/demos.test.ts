import { describe, it, expect, vi } from 'vitest';
import { provisionDemosForUser } from './demos';

// In-memory stub of (user_id, id) → row. Mimics two D1 statement shapes:
//   - `INSERT OR IGNORE INTO <table>` → conflict = no-op (changes=0)
//   - `INSERT INTO <table> … ON CONFLICT … DO UPDATE` → conflict = overwrite
function makeStubDb() {
  const rows = new Map<string, { id: string; user_id: string; updated_at: number; is_deleted: number; payload: string }>();
  const key = (table: string, userId: string, id: string) => `${table}::${userId}::${id}`;

  const db = {
    prepare: (sql: string) => {
      const ignoreMatch = sql.match(/INSERT OR IGNORE INTO (\w+)/);
      const upsertMatch = sql.match(/INSERT INTO (\w+)[\s\S]*ON CONFLICT/);
      const isUpsert = Boolean(upsertMatch);
      const table = ignoreMatch?.[1] ?? upsertMatch?.[1] ?? '';
      return {
        bind: (id: string, userId: string, updatedAt: number, payload: string) => ({
          run: async () => {
            const k = key(table, userId, id);
            const existing = rows.get(k);
            if (existing && !isUpsert) {
              return { success: true, meta: { changes: 0 } };
            }
            rows.set(k, { id, user_id: userId, updated_at: updatedAt, is_deleted: 0, payload });
            return { success: true, meta: { changes: 1 } };
          },
        }),
      };
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
  it('first call provisions all demo recipes + the demo event under the caller user_id', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    const out = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(out.alreadyProvisioned).toBe(false);
    expect(out.recipesInserted).toBe(15);
    expect(out.eventsInserted).toBe(1);

    // All rows are stamped under user_alice, not whoever the payload claims.
    const userIds = new Set(Array.from(rows.values()).map((r) => r.user_id));
    expect(userIds).toEqual(new Set(['user_alice']));

    // Sanity: a known demo id is present.
    expect(Array.from(rows.values()).some((r) => r.id === 'r_demo_ribeye')).toBe(true);
    expect(Array.from(rows.values()).some((r) => r.id === 'e_demo_main')).toBe(true);
  });

  it('second call is a no-op (KV marker fast-skips)', async () => {
    const { db } = makeStubDb();
    const { kv } = makeStubKv();
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    const second = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(second.alreadyProvisioned).toBe(true);
    expect(second.recipesInserted).toBe(0);
    expect(second.eventsInserted).toBe(0);
  });

  it('INSERT OR IGNORE preserves an existing recipe with the same id', async () => {
    // Pre-seed user_alice with a customized r_demo_ribeye. The provision
    // call must NOT overwrite it. Counts that as 14 recipes inserted (15 - 1).
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
    expect(out.recipesInserted).toBe(14);
    // Customized recipe payload still wins.
    const ribeye = rows.get('recipes::user_alice::r_demo_ribeye');
    expect(ribeye?.payload).toContain('My Custom Ribeye');
  });

  it('each user gets their own private copy (cross-user isolation)', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_bob');
    const userIds = Array.from(rows.values()).map((r) => r.user_id);
    expect(userIds.filter((u) => u === 'user_alice').length).toBe(16); // 15 recipes + 1 event
    expect(userIds.filter((u) => u === 'user_bob').length).toBe(16);
  });

  it('v2 marker is consulted (v1 marker no longer fast-skips) — existing users get re-provisioned for the bigger event', async () => {
    const { db } = makeStubDb();
    const { kv, store } = makeStubKv();
    // Pre-seed the OLD v1 marker, mimicking a chef who was provisioned
    // last turn. The new v2 marker is absent.
    store.set('demos:provisioned:user_alice', '1');
    const out = await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    expect(out.alreadyProvisioned).toBe(false);
    expect(out.eventsInserted).toBe(1);
    expect(store.get('demos:provisioned:v2:user_alice')).toBe('1');
  });

  it('the demo event row UPSERTS over a stale v1 payload — chef sees the new £600 budget + 5 dishes', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    // Pre-seed a stale v1 event row under user_alice with old budget+dishes.
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
    const payload = JSON.parse(updated!.payload) as { budget: number; dishes: Array<{ recipeId: string }> };
    expect(payload.budget).toBe(600);
    // Should now carry 5 dishes (salad + calamari + tikka + lamb + ribeye).
    expect(payload.dishes.length).toBe(5);
    expect(payload.dishes.map((d) => d.recipeId)).toEqual(
      expect.arrayContaining([
        'r_demo_salad', 'r_demo_calamari', 'r_demo_tikka_masala', 'r_demo_lamb_rack', 'r_demo_ribeye',
      ]),
    );
  });

  it('recipe rows still use INSERT OR IGNORE — chef customisations to a demo recipe survive v2 provisioning', async () => {
    const { db, rows } = makeStubDb();
    const { kv } = makeStubKv();
    rows.set('recipes::user_alice::r_demo_ribeye', {
      id: 'r_demo_ribeye',
      user_id: 'user_alice',
      updated_at: 1000,
      is_deleted: 0,
      payload: JSON.stringify({ id: 'r_demo_ribeye', title: 'My Custom Ribeye' }),
    });
    await provisionDemosForUser({ DB: db, RATE_LIMIT: kv }, 'user_alice');
    const ribeye = rows.get('recipes::user_alice::r_demo_ribeye');
    expect(ribeye?.payload).toContain('My Custom Ribeye');
  });
});
