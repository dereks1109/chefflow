import { describe, it, expect, vi } from 'vitest';
import { deleteAccount, AccountDeleteError } from './accountDelete';
import { publish as communityPublish } from './community';

function makeFakeDb(rowCounts: Record<string, number>): D1Database {
  const deletedFor: string[] = [];
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...args: unknown[]) { params = args; return stmt; },
        async run() {
          const match = /DELETE FROM (\w+) WHERE user_id = \?/.exec(sql);
          if (match) {
            const table = match[1];
            const [userId] = params as [string];
            deletedFor.push(`${table}:${userId}`);
            return { success: true, meta: { changes: rowCounts[table] ?? 0 }, results: [] } as unknown as D1Result;
          }
          return { success: true, meta: { changes: 0 }, results: [] } as unknown as D1Result;
        },
        async all() { return { success: true, results: [], meta: {} } as unknown as D1Result; },
        async first() { return null; },
        async raw() { return []; },
      } as unknown as D1PreparedStatement;
      return stmt;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
    _deletedFor: deletedFor,
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

describe('deleteAccount', () => {
  it('cascades through D1, unpublishes community recipes, removes demo marker, and deletes the Clerk user', async () => {
    const db = makeFakeDb({ recipes: 5, events: 2, menus: 1, allergen_audits: 3 });
    const kv = makeFakeKv();
    await communityPublish(kv, 'u_alice', 'Alice', { id: 'r1', title: 'A', originalYield: 1, ingredients: [], steps: [] } as never, 100);
    await communityPublish(kv, 'u_bob',   'Bob',   { id: 'r2', title: 'B', originalYield: 1, ingredients: [], steps: [] } as never, 200);
    await kv.put('demos:provisioned:v6:u_alice', '1');

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.clerk.com/v1/users/u_alice');
      expect(init?.method).toBe('DELETE');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const out = await deleteAccount(db, kv, 'u_alice', 'sk_test_x', fetchImpl);

    expect(out.deleted).toEqual({ recipes: 5, events: 2, menus: 1, allergen_audits: 3 });
    expect(out.communityRecipesUnpublished).toBe(1); // alice's only
    expect(out.clerkDeleted).toBe(true);
    expect(await kv.get('demos:provisioned:v6:u_alice')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats Clerk 404 as success (idempotent delete)', async () => {
    const db = makeFakeDb({ recipes: 0, events: 0, menus: 0, allergen_audits: 0 });
    const kv = makeFakeKv();
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;

    const out = await deleteAccount(db, kv, 'u_alice', 'sk_test_x', fetchImpl);
    expect(out.clerkDeleted).toBe(true);
  });

  it('throws AccountDeleteError when Clerk returns 5xx', async () => {
    const db = makeFakeDb({ recipes: 0, events: 0, menus: 0, allergen_audits: 0 });
    const kv = makeFakeKv();
    const fetchImpl = vi.fn(async () => new Response('server error', { status: 502 })) as unknown as typeof fetch;

    await expect(
      deleteAccount(db, kv, 'u_alice', 'sk_test_x', fetchImpl),
    ).rejects.toBeInstanceOf(AccountDeleteError);
  });

  it('survives an empty community index (no published recipes)', async () => {
    const db = makeFakeDb({ recipes: 0, events: 0, menus: 0, allergen_audits: 0 });
    const kv = makeFakeKv();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

    const out = await deleteAccount(db, kv, 'u_alice', 'sk_test_x', fetchImpl);
    expect(out.communityRecipesUnpublished).toBe(0);
  });
});
