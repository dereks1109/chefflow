import { describe, it, expect, beforeEach } from 'vitest';
import { handleDeleteAccount, handleExportAccount } from './account';

// Self-contained in-memory D1 stub. Covers the SQL surface used by
// account.ts: SELECT … WHERE owner_id = ? ORDER BY updated_at, and
// DELETE FROM <table> WHERE owner_id = ?. Sync's stub is separate (it
// covers a different SQL subset) so duplicating a tiny one here keeps
// the test self-contained.
interface Row {
  id: string;
  owner_id: string;
  updated_at: number;
  server_version: number;
  deleted_at: number | null;
  payload: string;
}

function makeD1(seed: Record<string, Row[]> = {}): D1Database {
  const tables: Record<string, Row[]> = {
    recipes: [...(seed.recipes ?? [])],
    events: [...(seed.events ?? [])],
    user_prefs: [...(seed.user_prefs ?? [])],
  };

  function exec(sql: string, params: unknown[]): { rows: Row[]; changes: number } {
    const selectAllRe = /^SELECT id, updated_at[\s\S]*FROM (\w+)\s+WHERE owner_id = \?\s+ORDER BY updated_at/;
    const deleteRe = /^DELETE FROM (\w+) WHERE owner_id = \?/;
    let m = selectAllRe.exec(sql);
    if (m) {
      const table = m[1];
      const [ownerId] = params as [string];
      const matches = tables[table]
        .filter((r) => r.owner_id === ownerId)
        .sort((a, b) => a.updated_at - b.updated_at);
      return { rows: matches, changes: 0 };
    }
    m = deleteRe.exec(sql);
    if (m) {
      const table = m[1];
      const [ownerId] = params as [string];
      const before = tables[table].length;
      tables[table] = tables[table].filter((r) => r.owner_id !== ownerId);
      return { rows: [], changes: before - tables[table].length };
    }
    throw new Error(`Unhandled SQL in account stub: ${sql}`);
  }

  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          params = args;
          return stmt;
        },
        async all<T>(): Promise<{ results: T[] }> {
          const { rows } = exec(sql, params);
          return { results: rows as unknown as T[] };
        },
        async run(): Promise<{ success: boolean; meta: { changes: number } }> {
          const { changes } = exec(sql, params);
          return { success: true, meta: { changes } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function row(owner: string, id: string, updatedAt: number, payload: object): Row {
  return {
    id,
    owner_id: owner,
    updated_at: updatedAt,
    server_version: updatedAt,
    deleted_at: null,
    payload: JSON.stringify(payload),
  };
}

let db: D1Database;

beforeEach(() => {
  db = makeD1({
    recipes: [
      row('userA', 'r1', 1000, { title: 'A-Ribeye' }),
      row('userA', 'r2', 1100, { title: 'A-Salad' }),
      row('userB', 'r3', 1200, { title: 'B-Stew' }),
    ],
    events: [
      row('userA', 'e1', 2000, { title: 'A-Dinner' }),
      row('userB', 'e2', 2100, { title: 'B-Lunch' }),
    ],
    user_prefs: [
      row('userA', 'userA', 3000, { unitSystem: 'metric' }),
      row('userB', 'userB', 3100, { unitSystem: 'imperial' }),
    ],
  });
});

describe('handleDeleteAccount', () => {
  it('hard-deletes all rows for the caller across the three tables', async () => {
    const result = await handleDeleteAccount(db, 'userA');
    expect(result.deleted).toEqual({ recipes: 2, events: 1, user_prefs: 1 });
  });

  it('does NOT touch other owners\' rows (isolation)', async () => {
    await handleDeleteAccount(db, 'userA');
    const remaining = await handleExportAccount(db, 'userB');
    expect(remaining.recipes.map((r) => r.id)).toEqual(['r3']);
    expect(remaining.events.map((r) => r.id)).toEqual(['e2']);
    expect(remaining.prefs.map((r) => r.id)).toEqual(['userB']);
  });

  it('returns zero counts when the caller has no rows', async () => {
    await handleDeleteAccount(db, 'userA');
    const second = await handleDeleteAccount(db, 'userA');
    expect(second.deleted).toEqual({ recipes: 0, events: 0, user_prefs: 0 });
  });
});

describe('handleExportAccount', () => {
  it('returns every row owned by the caller across the three tables', async () => {
    const data = await handleExportAccount(db, 'userA', () => 99999);
    expect(data.ownerId).toBe('userA');
    expect(data.exportedAt).toBe(99999);
    expect(data.recipes.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(data.events.map((r) => r.id)).toEqual(['e1']);
    expect(data.prefs.map((r) => r.id)).toEqual(['userA']);
  });

  it('parses the payload back to a JSON object', async () => {
    const data = await handleExportAccount(db, 'userA');
    expect(data.recipes[0].payload).toEqual({ title: 'A-Ribeye' });
  });

  it('does NOT leak other owners\' rows', async () => {
    const data = await handleExportAccount(db, 'userA');
    const ids = [...data.recipes, ...data.events, ...data.prefs].map((r) => r.id);
    expect(ids).not.toContain('r3');
    expect(ids).not.toContain('e2');
    expect(ids).not.toContain('userB');
  });

  it('returns empty arrays when the caller has no data', async () => {
    const data = await handleExportAccount(db, 'unknown_user');
    expect(data.recipes).toEqual([]);
    expect(data.events).toEqual([]);
    expect(data.prefs).toEqual([]);
  });
});
