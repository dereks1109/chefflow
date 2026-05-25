import { describe, it, expect } from 'vitest';
import { exportAccount } from './accountExport';
import { publish as communityPublish } from './community';

// Reuses the in-memory pattern from takedown.test.ts but tailored to the
// SELECT shape exportTable needs.
function makeFakeDb(seed: Record<string, Array<{ id: string; user_id: string; updated_at: number; is_deleted: 0 | 1; payload: string }>>): D1Database {
  return {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...args: unknown[]) { bindings = args; return stmt; },
        async all<T = unknown>() {
          // sql looks like: SELECT id, ... FROM <table> WHERE user_id = ? ORDER BY ...
          const match = /FROM (\w+)/.exec(sql);
          const table = match?.[1] ?? '';
          const [userId] = bindings as [string];
          const all = seed[table] ?? [];
          const mine = all.filter((r) => r.user_id === userId).map((r) => ({
            id: r.id, updated_at: r.updated_at, is_deleted: r.is_deleted, payload: r.payload,
          }));
          return { success: true, results: mine as T[], meta: {} } as unknown as D1Result<T>;
        },
        async run() { return { success: true, meta: { changes: 0 }, results: [] } as unknown as D1Result; },
        async first() { return null; },
        async raw() { return []; },
      } as unknown as D1PreparedStatement;
      return stmt;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function makeFakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    async list({ prefix }: { prefix?: string } = {}) {
      const keys = Array.from(store.keys()).filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cacheStatus: null } as unknown as KVNamespaceListResult<unknown, string>;
    },
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

describe('exportAccount', () => {
  it('returns rows from all four tables filtered to the caller, with payload JSON parsed', async () => {
    const db = makeFakeDb({
      recipes: [
        { id: 'r1', user_id: 'u_alice', updated_at: 100, is_deleted: 0, payload: '{"title":"R1"}' },
        { id: 'r2', user_id: 'u_bob', updated_at: 200, is_deleted: 0, payload: '{"title":"BobR"}' },
      ],
      events: [
        { id: 'e1', user_id: 'u_alice', updated_at: 50, is_deleted: 0, payload: '{"title":"E1"}' },
      ],
      menus: [],
      allergen_audits: [
        { id: 'a1', user_id: 'u_alice', updated_at: 10, is_deleted: 0, payload: '{"removedTag":"milk"}' },
      ],
    });
    const kv = makeFakeKv();
    const out = await exportAccount(db, kv, 'u_alice', 999);

    expect(out.userId).toBe('u_alice');
    expect(out.exportedAt).toBe(999);
    expect(out.schemaVersion).toBe(1);
    expect(out.tables.recipes).toHaveLength(1);
    expect(out.tables.recipes[0]).toEqual({ id: 'r1', updated_at: 100, is_deleted: 0, payload: { title: 'R1' } });
    expect(out.tables.events).toHaveLength(1);
    expect(out.tables.events[0].payload).toEqual({ title: 'E1' });
    expect(out.tables.menus).toEqual([]);
    expect(out.tables.allergen_audits).toHaveLength(1);
    expect(out.communityRecipes).toEqual([]);
  });

  it('includes tombstoned rows (is_deleted=1) — portability == everything we hold', async () => {
    const db = makeFakeDb({
      recipes: [
        { id: 'r1', user_id: 'u_alice', updated_at: 100, is_deleted: 1, payload: '{"title":"deleted"}' },
      ],
      events: [], menus: [], allergen_audits: [],
    });
    const kv = makeFakeKv();
    const out = await exportAccount(db, kv, 'u_alice');
    expect(out.tables.recipes).toHaveLength(1);
    expect(out.tables.recipes[0].is_deleted).toBe(1);
  });

  it('includes community recipes authored by the caller (and excludes others)', async () => {
    const db = makeFakeDb({ recipes: [], events: [], menus: [], allergen_audits: [] });
    const kv = makeFakeKv();
    await communityPublish(kv, 'u_alice', 'Alice', { id: 'r_a1', title: 'AliceRecipe', originalYield: 1, ingredients: [], steps: [] } as never, 100);
    await communityPublish(kv, 'u_bob', 'Bob', { id: 'r_b1', title: 'BobRecipe', originalYield: 1, ingredients: [], steps: [] } as never, 200);
    const out = await exportAccount(db, kv, 'u_alice');
    expect(out.communityRecipes).toHaveLength(1);
    expect((out.communityRecipes[0] as { title: string }).title).toBe('AliceRecipe');
  });

  it('handles malformed payload JSON without throwing', async () => {
    const db = makeFakeDb({
      recipes: [
        { id: 'r1', user_id: 'u_alice', updated_at: 100, is_deleted: 0, payload: 'this is not JSON' },
      ],
      events: [], menus: [], allergen_audits: [],
    });
    const kv = makeFakeKv();
    const out = await exportAccount(db, kv, 'u_alice');
    expect(out.tables.recipes[0].payload).toMatchObject({ _parseError: true, _raw: 'this is not JSON' });
  });
});
