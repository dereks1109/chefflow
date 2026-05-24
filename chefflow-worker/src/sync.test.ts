import { describe, it, expect, beforeEach } from 'vitest';
import { handlePull, handlePush, type PushBody } from './sync';

// Minimal in-memory D1 stub. Implements just enough of the chained
// `.prepare().bind().first()/all()/run()` surface used by sync.ts.
interface Row {
  id: string;
  owner_id: string;
  updated_at: number;
  server_version: number;
  deleted_at: number | null;
  payload: string;
}

function makeD1(): D1Database {
  const tables: Record<string, Row[]> = { recipes: [], events: [] };

  function exec(sql: string, params: unknown[]): { rows: Row[]; mutated: boolean } {
    if (/^SELECT updated_at FROM (\w+)/.test(sql)) {
      const table = /FROM (\w+)/.exec(sql)![1];
      const [ownerId, id] = params as [string, string];
      const found = tables[table].find((r) => r.owner_id === ownerId && r.id === id);
      return { rows: found ? [found] : [], mutated: false };
    }
    if (/^SELECT id, updated_at/.test(sql)) {
      const table = /FROM (\w+)/.exec(sql)![1];
      const [ownerId, since] = params as [string, number];
      const matches = tables[table]
        .filter((r) => r.owner_id === ownerId && r.server_version > since)
        .sort((a, b) => a.server_version - b.server_version);
      return { rows: matches, mutated: false };
    }
    if (/^INSERT INTO (\w+)/.test(sql)) {
      const table = /INSERT INTO (\w+)/.exec(sql)![1];
      const [id, ownerId, updatedAt, serverVersion, deletedAt, payload] = params as [
        string, string, number, number, number | null, string,
      ];
      const idx = tables[table].findIndex((r) => r.owner_id === ownerId && r.id === id);
      const row: Row = {
        id, owner_id: ownerId, updated_at: updatedAt, server_version: serverVersion,
        deleted_at: deletedAt, payload,
      };
      if (idx >= 0) tables[table][idx] = row;
      else tables[table].push(row);
      return { rows: [], mutated: true };
    }
    throw new Error(`Unhandled SQL in stub: ${sql}`);
  }

  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          params = args;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          const { rows } = exec(sql, params);
          return (rows[0] as unknown as T) ?? null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          const { rows } = exec(sql, params);
          return { results: rows as unknown as T[] };
        },
        async run(): Promise<unknown> {
          exec(sql, params);
          return { success: true };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

let db: D1Database;
let now: number;

beforeEach(() => {
  db = makeD1();
  now = 10_000;
});

const clock = () => now++;

describe('worker sync — handlePush LWW', () => {
  it('inserts a new row with server-assigned serverVersion', async () => {
    const body: PushBody = {
      recipes: [{ id: 'r1', updatedAt: 1000, title: 'New', dirty: true }],
    };
    const res = await handlePush(db, 'userA', body, clock);
    expect(res.recipes.r1).toBe(10_000);
    expect(res.events).toEqual({});
  });

  it('overwrites an older row (incoming.updatedAt > stored)', async () => {
    await handlePush(db, 'userA', { recipes: [{ id: 'r1', updatedAt: 1000, title: 'v1' }] }, clock);
    const res = await handlePush(db, 'userA', {
      recipes: [{ id: 'r1', updatedAt: 2000, title: 'v2' }],
    }, clock);
    expect(typeof res.recipes.r1).toBe('number');

    const pull = await handlePull(db, 'userA', 0, clock);
    expect(pull.recipes).toHaveLength(1);
    expect(pull.recipes[0].payload.title).toBe('v2');
  });

  it('rejects an older write (server wins on LWW)', async () => {
    await handlePush(db, 'userA', { recipes: [{ id: 'r1', updatedAt: 3000, title: 'fresh' }] }, clock);
    const res = await handlePush(db, 'userA', {
      recipes: [{ id: 'r1', updatedAt: 2000, title: 'stale' }],
    }, clock);
    expect(res.recipes.r1).toBeNull();

    const pull = await handlePull(db, 'userA', 0, clock);
    expect(pull.recipes[0].payload.title).toBe('fresh');
  });

  it('strips the client-only dirty flag before storing', async () => {
    await handlePush(db, 'userA', {
      recipes: [{ id: 'r1', updatedAt: 1000, title: 't', dirty: true }],
    }, clock);
    const pull = await handlePull(db, 'userA', 0, clock);
    expect(pull.recipes[0].payload.dirty).toBeUndefined();
  });

  it('records tombstones with deletedAt set', async () => {
    await handlePush(db, 'userA', { recipes: [{ id: 'r1', updatedAt: 1000, title: 't' }] }, clock);
    await handlePush(db, 'userA', {
      recipes: [{ id: 'r1', updatedAt: 2000, deletedAt: 2000 }],
    }, clock);
    const pull = await handlePull(db, 'userA', 0, clock);
    expect(pull.recipes[0].deletedAt).toBe(2000);
  });
});

describe('worker sync — handlePull owner isolation', () => {
  it('does not return userB rows for userA', async () => {
    await handlePush(db, 'userA', { recipes: [{ id: 'rA', updatedAt: 1000, title: 'A' }] }, clock);
    await handlePush(db, 'userB', { recipes: [{ id: 'rB', updatedAt: 1000, title: 'B' }] }, clock);

    const a = await handlePull(db, 'userA', 0, clock);
    expect(a.recipes).toHaveLength(1);
    expect(a.recipes[0].id).toBe('rA');

    const b = await handlePull(db, 'userB', 0, clock);
    expect(b.recipes).toHaveLength(1);
    expect(b.recipes[0].id).toBe('rB');
  });

  it('only returns rows newer than `since`', async () => {
    const r1 = await handlePush(db, 'userA', { recipes: [{ id: 'r1', updatedAt: 1000, title: 't1' }] }, clock);
    const r1Version = r1.recipes.r1!;

    const r2 = await handlePush(db, 'userA', { recipes: [{ id: 'r2', updatedAt: 1000, title: 't2' }] }, clock);
    const r2Version = r2.recipes.r2!;

    const pull = await handlePull(db, 'userA', r1Version, clock);
    expect(pull.recipes.map((r) => r.id)).toEqual(['r2']);
    expect(pull.recipes[0].serverVersion).toBe(r2Version);
  });

  it('returns events separately from recipes', async () => {
    await handlePush(db, 'userA', {
      recipes: [{ id: 'r1', updatedAt: 1000, title: 'recipe' }],
      events: [{ id: 'e1', updatedAt: 1000, title: 'event' }],
    }, clock);

    const pull = await handlePull(db, 'userA', 0, clock);
    expect(pull.recipes).toHaveLength(1);
    expect(pull.events).toHaveLength(1);
    expect(pull.events[0].id).toBe('e1');
  });
});
