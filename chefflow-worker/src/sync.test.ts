import { describe, it, expect, beforeEach } from 'vitest';
import { pull, push, type PushBody } from './sync';

// In-memory D1 stub — emulates the prepared-statement subset sync.ts uses.
// Keyed by (table, user_id, id). Returns a D1Database-shaped object so we
// don't drag a real sqlite engine into unit tests.
interface Row { user_id: string; id: string; updated_at: number; is_deleted: number; payload: string; }
interface GroupRow { id: string; owner_user_id: string; name: string; }

function makeDb() {
  const store: Record<string, Row[]> = {
    recipes: [], events: [], menus: [], allergen_audits: [],
  };
  // T6 — groups table for the pull's team-name lookup. Tests that
  // care about team_name decoration seed this directly; the rest
  // leave it empty and team_name comes back undefined.
  const groups: GroupRow[] = [];

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
        // T6 — pull's team-name lookup: SELECT id, name FROM groups WHERE owner_user_id = ?
        if (sql.startsWith('SELECT id, name FROM groups')) {
          const [ownerUserId] = boundArgs as [string];
          const results = groups
            .filter((g) => g.owner_user_id === ownerUserId)
            .map((g) => ({ id: g.id, name: g.name }));
          return { results, success: true } as T;
        }
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

  return { prepare, store, groups } as unknown as D1Database & { store: typeof store; groups: GroupRow[] };
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

  it('with viewerGroupPairs, fan-ins owner\'s recipes + events + menus where the row\'s sharedWithGroupIds intersects the viewer\'s entitled groups', async () => {
    const db = makeDb();
    await push(db, 'user_owner', {
      recipes: [{ id: 'r_owner', updated_at: 100, payload: { id: 'r_owner', title: 'shared recipe', sharedWithGroupIds: ['grp_default'] } }],
      events:  [{ id: 'e_owner', updated_at: 100, payload: { id: 'e_owner', title: 'shared event', sharedWithGroupIds: ['grp_default'] } }],
      menus:   [{ id: 'm_owner', updated_at: 100, payload: { id: 'm_owner', title: 'shared menu', sharedWithGroupIds: ['grp_default'] } }],
    });
    await push(db, 'user_viewer', {
      recipes: [{ id: 'r_viewer', updated_at: 100, payload: { id: 'r_viewer', title: 'my recipe' } }],
    });

    const out = await pull(db, 'user_viewer', 0, [
      { ownerUserId: 'user_owner', groupId: 'grp_default' },
    ]);

    // Viewer's own recipe + owner's shared recipe, marked correctly.
    expect(out.recipes).toHaveLength(2);
    const owned = out.recipes.find((r) => r.id === 'r_viewer')!;
    const shared = out.recipes.find((r) => r.id === 'r_owner')!;
    expect(owned.owner_user_id).toBeUndefined();
    expect(shared.owner_user_id).toBe('user_owner');
    expect(shared.read_only).toBe(1);

    // Owner's event + menu were fanned in too (T4 includes menus when
    // explicitly shared; T3c excluded them entirely).
    expect(out.events).toHaveLength(1);
    expect(out.events[0].owner_user_id).toBe('user_owner');
    expect(out.menus).toHaveLength(1);
    expect(out.menus[0].owner_user_id).toBe('user_owner');
  });

  it('FILTERS OUT owner rows whose sharedWithGroupIds does NOT include the viewer\'s entitled group (private items stay private)', async () => {
    const db = makeDb();
    await push(db, 'user_owner', {
      recipes: [
        { id: 'r_default',  updated_at: 100, payload: { id: 'r_default',  sharedWithGroupIds: ['grp_default'] } },
        { id: 'r_morning',  updated_at: 100, payload: { id: 'r_morning',  sharedWithGroupIds: ['grp_morning'] } },
        { id: 'r_private',  updated_at: 100, payload: { id: 'r_private' /* no sharedWithGroupIds = private */ } },
      ],
    });

    const out = await pull(db, 'user_viewer', 0, [
      { ownerUserId: 'user_owner', groupId: 'grp_default' },
    ]);

    // Only the default-shared recipe is visible; morning + private are filtered out.
    expect(out.recipes.map((r) => r.id)).toEqual(['r_default']);
  });

  it('NEVER fan-ins allergen_audits — owner safety records stay strictly per-user even with explicit group sharing', async () => {
    const db = makeDb();
    await push(db, 'user_owner', {
      allergen_audits: [{ id: 'a_owner', updated_at: 100, payload: { id: 'a_owner', sharedWithGroupIds: ['grp_default'] } }],
    });

    const out = await pull(db, 'user_viewer', 0, [
      { ownerUserId: 'user_owner', groupId: 'grp_default' },
    ]);

    expect(out.allergen_audits).toHaveLength(0);
  });

  it('respects `since` cursor for shared rows too — a fast-syncing viewer doesn\'t re-receive every owner row on every pull', async () => {
    const db = makeDb();
    await push(db, 'user_owner', { recipes: [{ id: 'r_old', updated_at: 50,  payload: { id: 'r_old', sharedWithGroupIds: ['grp_default'] } }] });
    await push(db, 'user_owner', { recipes: [{ id: 'r_new', updated_at: 150, payload: { id: 'r_new', sharedWithGroupIds: ['grp_default'] } }] });

    const out = await pull(db, 'user_viewer', 100, [
      { ownerUserId: 'user_owner', groupId: 'grp_default' },
    ]);

    expect(out.recipes).toHaveLength(1);
    expect(out.recipes[0].id).toBe('r_new');
  });

  it('with MULTIPLE viewerGroupPairs (chef on two teams), fan-ins all of them with their respective owner_user_id', async () => {
    const db = makeDb();
    await push(db, 'user_owner1', { recipes: [{ id: 'r_o1', updated_at: 100, payload: { id: 'r_o1', sharedWithGroupIds: ['grp_a'] } }] });
    await push(db, 'user_owner2', { recipes: [{ id: 'r_o2', updated_at: 100, payload: { id: 'r_o2', sharedWithGroupIds: ['grp_b'] } }] });

    const out = await pull(db, 'user_viewer', 0, [
      { ownerUserId: 'user_owner1', groupId: 'grp_a' },
      { ownerUserId: 'user_owner2', groupId: 'grp_b' },
    ]);

    expect(out.recipes).toHaveLength(2);
    expect(out.recipes.find((r) => r.id === 'r_o1')!.owner_user_id).toBe('user_owner1');
    expect(out.recipes.find((r) => r.id === 'r_o2')!.owner_user_id).toBe('user_owner2');
  });

  it('decorates each shared row with team_id + team_name from the matched group (T6 — member SPA can render the team name on cards without an extra round-trip)', async () => {
    const db = makeDb();
    db.groups.push(
      { id: 'grp_morning', owner_user_id: 'user_owner', name: 'Morning shift' },
      { id: 'grp_evening', owner_user_id: 'user_owner', name: 'Evening shift' },
    );
    await push(db, 'user_owner', {
      recipes: [
        { id: 'r_m', updated_at: 100, payload: { id: 'r_m', sharedWithGroupIds: ['grp_morning'] } },
        { id: 'r_e', updated_at: 100, payload: { id: 'r_e', sharedWithGroupIds: ['grp_evening'] } },
      ],
    });

    const out = await pull(db, 'user_viewer', 0, [
      { ownerUserId: 'user_owner', groupId: 'grp_morning' },
      { ownerUserId: 'user_owner', groupId: 'grp_evening' },
    ]);

    const morning = out.recipes.find((r) => r.id === 'r_m')!;
    const evening = out.recipes.find((r) => r.id === 'r_e')!;
    expect(morning.team_id).toBe('grp_morning');
    expect(morning.team_name).toBe('Morning shift');
    expect(evening.team_id).toBe('grp_evening');
    expect(evening.team_name).toBe('Evening shift');
  });
});
