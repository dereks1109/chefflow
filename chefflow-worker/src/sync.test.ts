import { describe, it, expect, beforeEach } from 'vitest';
import { pull, push, type PushBody } from './sync';

// In-memory D1 stub — emulates the prepared-statement subset sync.ts uses.
// Keyed by (table, user_id, id). Returns a D1Database-shaped object so we
// don't drag a real sqlite engine into unit tests.
interface Row { user_id: string; id: string; updated_at: number; is_deleted: number; payload: string; }

function makeDb() {
  const store: Record<string, Row[]> = {
    recipes: [], events: [], menus: [], allergen_audits: [],
  };

  const prepare = (sql: string) => {
    let boundArgs: unknown[] = [];
    const tableMatch = sql.match(/(?:FROM|INTO)\s+(\w+)/);
    const table = tableMatch ? tableMatch[1] : '';
    return {
      bind(...args: unknown[]) { boundArgs = args; return this; },
      async first<T>() {
        if (sql.startsWith('SELECT updated_at')) {
          const [userId, id] = boundArgs as [string, string];
          const row = store[table]?.find((r) => r.user_id === userId && r.id === id);
          return (row ? { updated_at: row.updated_at } : null) as T;
        }
        return null as T;
      },
      async all<T>() {
        if (sql.startsWith('SELECT id, updated_at, is_deleted, payload')) {
          const [userId, since] = boundArgs as [string, number];
          const results = (store[table] ?? [])
            .filter((r) => r.user_id === userId && r.updated_at > since)
            .map((r) => ({ id: r.id, updated_at: r.updated_at, is_deleted: r.is_deleted, payload: r.payload }))
            .sort((a, b) => a.updated_at - b.updated_at);
          return { results, success: true } as T;
        }
        return { results: [], success: true } as T;
      },
      async run() {
        if (sql.startsWith('INSERT INTO')) {
          const [id, userId, updatedAt, isDeleted, payload] = boundArgs as [string, string, number, number, string];
          const arr = store[table] ?? (store[table] = []);
          const ix = arr.findIndex((r) => r.user_id === userId && r.id === id);
          const row: Row = { user_id: userId, id, updated_at: updatedAt, is_deleted: isDeleted, payload };
          if (ix >= 0) arr[ix] = row;
          else arr.push(row);
        }
        return { success: true };
      },
    };
  };

  return { prepare, store } as unknown as D1Database & { store: typeof store };
}

const fakePayload = (title: string) => ({ id: 'r1', title, ingredients: [], steps: [] });

describe('sync.push — Last-Write-Wins invariant', () => {
  let db: D1Database & { store: Record<string, Row[]> };
  beforeEach(() => { db = makeDb() as D1Database & { store: Record<string, Row[]> }; });

  it('writes a brand-new row → status applied — first time we see it', async () => {
    const body: PushBody = {
      recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('original') }],
    };
    const out = await push(db, 'user_a', body);
    expect(out).toEqual([{ table: 'recipes', id: 'r1', status: 'applied' }]);
    expect(db.store.recipes).toHaveLength(1);
    expect(JSON.parse(db.store.recipes[0].payload).title).toBe('original');
  });

  it('overwrites when incoming updated_at is newer — LWW server-side wins', async () => {
    // Seed an older row.
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('old') }] });
    // Newer push overwrites.
    const out = await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 200, payload: fakePayload('newer') }] });
    expect(out[0].status).toBe('applied');
    expect(JSON.parse(db.store.recipes[0].payload).title).toBe('newer');
  });

  it('rejects as stale when incoming updated_at is older — server keeps newer copy', async () => {
    // Seed a newer row.
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 500, payload: fakePayload('current') }] });
    // Older push is rebuffed.
    const out = await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('stale-attempt') }] });
    expect(out[0].status).toBe('stale');
    expect(JSON.parse(db.store.recipes[0].payload).title).toBe('current');
  });

  it('equal updated_at is also stale — no clobbering at the same timestamp', async () => {
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('first') }] });
    const out = await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('tie') }] });
    expect(out[0].status).toBe('stale');
    expect(JSON.parse(db.store.recipes[0].payload).title).toBe('first');
  });
});

describe('sync.push — user_id is authoritative from the token, never the body', () => {
  it("a row pushed by user_a is stamped with user_a even if payload claims otherwise", async () => {
    // The PushRowInput has no user_id field — but a malicious client could
    // try to smuggle one inside `payload`. The server stores user_id from
    // the token, so the smuggled value never lands in the user_id column.
    const db = makeDb();
    await push(db, 'user_a', {
      recipes: [{ id: 'r1', updated_at: 1, payload: { id: 'r1', userId: 'user_b', title: 'sneaky' } }],
    });
    expect((db as any).store.recipes[0].user_id).toBe('user_a');
  });

  it('two users can mint rows with the same id without colliding — PK is (user_id, id)', async () => {
    const db = makeDb();
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 1, payload: fakePayload('A') }] });
    await push(db, 'user_b', { recipes: [{ id: 'r1', updated_at: 1, payload: fakePayload('B') }] });
    const store = (db as any).store.recipes;
    expect(store).toHaveLength(2);
    expect(store.find((r: Row) => r.user_id === 'user_a').payload).toContain('"title":"A"');
    expect(store.find((r: Row) => r.user_id === 'user_b').payload).toContain('"title":"B"');
  });
});

describe('sync.pull — delta-only filter', () => {
  it("returns only rows updated after `since`", async () => {
    const db = makeDb();
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('a') }] });
    await push(db, 'user_a', { recipes: [{ id: 'r2', updated_at: 200, payload: fakePayload('b') }] });
    await push(db, 'user_a', { recipes: [{ id: 'r3', updated_at: 300, payload: fakePayload('c') }] });
    const out = await pull(db, 'user_a', 150);
    expect(out.recipes.map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('never returns rows belonging to a different user — even if ids match', async () => {
    const db = makeDb();
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('A-private') }] });
    await push(db, 'user_b', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('B-private') }] });
    const out = await pull(db, 'user_a', 0);
    expect(out.recipes).toHaveLength(1);
    expect(JSON.parse(out.recipes[0].payload).title).toBe('A-private');
  });

  it('includes soft-deleted rows so deletions propagate to other devices', async () => {
    const db = makeDb();
    await push(db, 'user_a', { recipes: [{ id: 'r1', updated_at: 100, payload: fakePayload('a'), is_deleted: true }] });
    const out = await pull(db, 'user_a', 0);
    expect(out.recipes[0].is_deleted).toBe(1);
  });
});

describe('sync.push — payload size cap', () => {
  it('rejects payloads larger than ~900 KB so D1 row limits never bite', async () => {
    const db = makeDb();
    // 1 MB of `x` — exceeds the 900 KB cap.
    const huge = 'x'.repeat(1_000_000);
    const out = await push(db, 'user_a', {
      recipes: [{ id: 'big', updated_at: 1, payload: { id: 'big', title: huge } }],
    });
    expect(out[0].status).toBe('rejected');
    expect(out[0].reason).toMatch(/exceeds/);
    expect((db as any).store.recipes).toHaveLength(0); // nothing persisted
  });
});

describe('sync.pull — Phase 3 team-share fan-in (T3c)', () => {
  // Why this matters: a member viewing an Enterprise owner's team needs
  // the owner's recipes + events delivered alongside their own on the
  // same pull, with provenance flags so the SPA can render "Shared by"
  // badges and lock editing. Per-user table isolation (the original
  // pull behaviour) must stay intact when viewerOwnerIds is empty so
  // 99% of users (non-members) see no behaviour change.

  it('with NO viewerOwnerIds (default), behaves identically to the pre-T3c pull — only the caller\'s own rows, no owner_user_id decoration', async () => {
    const db = makeDb();
    await push(db, 'user_owner', { recipes: [{ id: 'r_owner', updated_at: 100, payload: { id: 'r_owner', title: 'owner-only' } }] });
    await push(db, 'user_viewer', { recipes: [{ id: 'r_viewer', updated_at: 100, payload: { id: 'r_viewer', title: 'viewer-only' } }] });

    const out = await pull(db, 'user_viewer', 0);

    expect(out.recipes).toHaveLength(1);
    expect(out.recipes[0].id).toBe('r_viewer');
    expect(out.recipes[0].owner_user_id).toBeUndefined();
    expect(out.recipes[0].read_only).toBeUndefined();
  });

  it('with viewerOwnerIds, fan-ins owner\'s recipes + events as decorated read-only rows alongside the caller\'s own', async () => {
    const db = makeDb();
    await push(db, 'user_owner', {
      recipes: [{ id: 'r_owner', updated_at: 100, payload: { id: 'r_owner', title: 'shared recipe' } }],
      events:  [{ id: 'e_owner', updated_at: 100, payload: { id: 'e_owner', title: 'shared event'  } }],
    });
    await push(db, 'user_viewer', {
      recipes: [{ id: 'r_viewer', updated_at: 100, payload: { id: 'r_viewer', title: 'my recipe' } }],
    });

    const out = await pull(db, 'user_viewer', 0, ['user_owner']);

    // Viewer's own recipe + owner's shared recipe, marked correctly.
    expect(out.recipes).toHaveLength(2);
    const owned = out.recipes.find((r) => r.id === 'r_viewer')!;
    const shared = out.recipes.find((r) => r.id === 'r_owner')!;
    expect(owned.owner_user_id).toBeUndefined();
    expect(shared.owner_user_id).toBe('user_owner');
    expect(shared.read_only).toBe(1);

    // Owner's event was fanned in too.
    expect(out.events).toHaveLength(1);
    expect(out.events[0].id).toBe('e_owner');
    expect(out.events[0].owner_user_id).toBe('user_owner');
    expect(out.events[0].read_only).toBe(1);
  });

  it('NEVER fan-ins menus or allergen_audits — those tables stay per-user (menus = personal printouts, audits = owner safety records)', async () => {
    const db = makeDb();
    await push(db, 'user_owner', {
      menus:           [{ id: 'm_owner', updated_at: 100, payload: { id: 'm_owner', title: 'owner menu' } }],
      allergen_audits: [{ id: 'a_owner', updated_at: 100, payload: { id: 'a_owner' } }],
    });

    const out = await pull(db, 'user_viewer', 0, ['user_owner']);

    expect(out.menus).toHaveLength(0);
    expect(out.allergen_audits).toHaveLength(0);
  });

  it('respects `since` cursor for shared rows too — a fast-syncing viewer doesn\'t re-receive every owner row on every pull', async () => {
    const db = makeDb();
    await push(db, 'user_owner', { recipes: [{ id: 'r_old', updated_at: 50,  payload: { id: 'r_old' } }] });
    await push(db, 'user_owner', { recipes: [{ id: 'r_new', updated_at: 150, payload: { id: 'r_new' } }] });

    const out = await pull(db, 'user_viewer', 100, ['user_owner']);

    expect(out.recipes).toHaveLength(1);
    expect(out.recipes[0].id).toBe('r_new');
  });

  it('with MULTIPLE viewerOwnerIds (chef on two teams), fan-ins all of them with their respective owner_user_id', async () => {
    const db = makeDb();
    await push(db, 'user_owner1', { recipes: [{ id: 'r_o1', updated_at: 100, payload: { id: 'r_o1' } }] });
    await push(db, 'user_owner2', { recipes: [{ id: 'r_o2', updated_at: 100, payload: { id: 'r_o2' } }] });

    const out = await pull(db, 'user_viewer', 0, ['user_owner1', 'user_owner2']);

    expect(out.recipes).toHaveLength(2);
    expect(out.recipes.find((r) => r.id === 'r_o1')!.owner_user_id).toBe('user_owner1');
    expect(out.recipes.find((r) => r.id === 'r_o2')!.owner_user_id).toBe('user_owner2');
  });
});
