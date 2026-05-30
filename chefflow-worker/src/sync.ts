// Per-user sync engine — Cloudflare D1 backed.
//
// Two endpoints back this module:
//   GET  /api/sync/pull?since=<epoch_ms>   → returns rows updated after `since`
//   POST /api/sync/push                    → upserts a batch of client deltas
//
// Critical safety invariants (Rule 12 — fail loud):
//   1. `user_id` is ALWAYS the verified Clerk subject. Any user_id in the
//      request body is ignored. The caller passes `userId` from the JWT;
//      this module never reads userId from `body`.
//   2. Last-Write-Wins is enforced server-side via `updated_at`. A client
//      pushing a row with an older updated_at than what's in D1 gets a
//      'stale' status back; the row in D1 is NOT modified.
//   3. PRIMARY KEY (user_id, id) prevents cross-user collisions even if two
//      different chefs minted the same recipe id locally.

export const SYNC_TABLES = ['recipes', 'events', 'menus', 'allergen_audits'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

// Caps to keep payloads bounded. D1 row limit is 1 MB; we cap the JSON
// payload at ~900 KB to leave headroom for the small wrapping columns.
// Cover photos are inline base64 (~50–100 KB typical, but a worst-case
// 1600px photo can edge close to 200 KB).
const MAX_PAYLOAD_BYTES = 900_000;
const MAX_ROWS_PER_PUSH = 200;

export interface SyncRow {
  id: string;
  updated_at: number;
  is_deleted: 0 | 1;
  payload: string; // JSON-serialised
  /** Phase 3 (T3c) — set on rows that belong to ANOTHER user the caller
   *  is an accepted team viewer of. Drives the SPA's "Shared by <owner>"
   *  badge + read-only gate. Absent on the caller's own rows. */
  owner_user_id?: string;
  /** Phase 3 — 1 when the row is read-only (currently always paired
   *  with owner_user_id). Separate field so future "shared with edit"
   *  roles slot in cleanly. */
  read_only?: 0 | 1;
}

export interface PullResponse {
  recipes: SyncRow[];
  events: SyncRow[];
  menus: SyncRow[];
  allergen_audits: SyncRow[];
  /** Server-issued cursor the client persists as `lastPulledAt`. Using server
   *  clock prevents skew-driven missed updates. */
  serverNow: number;
}

export interface PushRowInput {
  id: string;
  updated_at: number;
  is_deleted?: boolean | 0 | 1;
  payload: unknown;
}

export interface PushBody {
  recipes?: PushRowInput[];
  events?: PushRowInput[];
  menus?: PushRowInput[];
  allergen_audits?: PushRowInput[];
}

export type PushOutcome = 'applied' | 'stale' | 'rejected';

export interface PushResult {
  table: SyncTable;
  id: string;
  status: PushOutcome;
  /** Present when status='rejected' — explains why (oversize, bad shape, etc.). */
  reason?: string;
}

export class SyncValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SyncValidationError';
  }
}

function isPushRow(x: unknown): x is PushRowInput {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.updated_at === 'number' && r.payload !== undefined;
}

function isTable(t: string): t is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(t);
}

/** Per-(member, group) entitlement used by pull(). Each pair says: for
 *  this owner, the caller is in this group, so they're entitled to see
 *  rows where group_id ∈ payload.sharedWithGroupIds. T4 replaces T3c's
 *  flat owner-id list. */
export interface ViewerGroupPair {
  ownerUserId: string;
  groupId: string;
}

// ---------------------------------------------------------------------------
// pull — fetch all rows for the verified user updated after `since`,
// optionally MERGED with read-only rows from owners the caller is an
// accepted team viewer of (T3c Phase 3 + T4 per-group filter). T4
// changes the previous "all of an owner's recipes/events" fan-in to
// per-item: each shared row's payload.sharedWithGroupIds must include
// at least one of the caller's groups under that owner. Menus are now
// shareable too (T3c excluded them; per-item opt-in makes it safe).
// allergen_audits stay strictly per-user (chef safety records).
// Shared rows are decorated with owner_user_id + read_only=1 so the
// SPA can render the "Shared by" badge and lock editing.
// ---------------------------------------------------------------------------
export async function pull(
  db: D1Database,
  userId: string,
  since: number,
  viewerGroupPairs: ViewerGroupPair[] = [],
): Promise<PullResponse> {
  if (!Number.isFinite(since) || since < 0) since = 0;

  const sqlOwn = (table: SyncTable) =>
    db
      .prepare(
        `SELECT id, updated_at, is_deleted, payload
         FROM ${table}
         WHERE user_id = ? AND updated_at > ?
         ORDER BY updated_at ASC`,
      )
      .bind(userId, since)
      .all<{ id: string; updated_at: number; is_deleted: number; payload: string }>();

  // Parallel reads — each table is independent.
  const [recipes, events, menus, audits] = await Promise.all([
    sqlOwn('recipes'),
    sqlOwn('events'),
    sqlOwn('menus'),
    sqlOwn('allergen_audits'),
  ]);

  const project = (r: { id: string; updated_at: number; is_deleted: number; payload: string }): SyncRow => ({
    id: r.id,
    updated_at: r.updated_at,
    is_deleted: r.is_deleted ? 1 : 0,
    payload: r.payload,
  });

  let sharedRecipes: SyncRow[] = [];
  let sharedEvents: SyncRow[] = [];
  let sharedMenus: SyncRow[] = [];
  if (viewerGroupPairs.length > 0) {
    // Group the caller's entitled groupIds per owner so we run ONE
    // SELECT per owner per table, then filter rows in JS by the
    // intersection of payload.sharedWithGroupIds and the caller's
    // groups under that owner. JS filter is O(rows × groups), which
    // at MVP scale (~1k rows × ~5 groups) is microseconds.
    const groupsByOwner = new Map<string, Set<string>>();
    for (const p of viewerGroupPairs) {
      const set = groupsByOwner.get(p.ownerUserId) ?? new Set<string>();
      set.add(p.groupId);
      groupsByOwner.set(p.ownerUserId, set);
    }

    const filterByGroup = (
      rows: { id: string; updated_at: number; is_deleted: number; payload: string }[],
      allowedGroupIds: Set<string>,
    ) =>
      rows.filter((r) => {
        let parsed: { sharedWithGroupIds?: unknown };
        try {
          parsed = JSON.parse(r.payload) as { sharedWithGroupIds?: unknown };
        } catch {
          return false;
        }
        const list = parsed.sharedWithGroupIds;
        if (!Array.isArray(list)) return false;
        for (const g of list) {
          if (typeof g === 'string' && allowedGroupIds.has(g)) return true;
        }
        return false;
      });

    const sharedPromises = Array.from(groupsByOwner.entries()).flatMap(
      ([ownerId, allowedGroupIds]) =>
        (['recipes', 'events', 'menus'] as const).map((table) =>
          db
            .prepare(
              `SELECT id, updated_at, is_deleted, payload
               FROM ${table} WHERE user_id = ? AND updated_at > ?
               ORDER BY updated_at ASC`,
            )
            .bind(ownerId, since)
            .all<{ id: string; updated_at: number; is_deleted: number; payload: string }>()
            .then((res) => ({
              kind: table,
              ownerId,
              rows: filterByGroup(res.results ?? [], allowedGroupIds),
            })),
        ),
    );
    const sharedResults = await Promise.all(sharedPromises);
    for (const s of sharedResults) {
      const decorated = s.rows.map((r) => ({
        ...project(r),
        owner_user_id: s.ownerId,
        read_only: 1 as const,
      }));
      if (s.kind === 'recipes') sharedRecipes = sharedRecipes.concat(decorated);
      else if (s.kind === 'events') sharedEvents = sharedEvents.concat(decorated);
      else sharedMenus = sharedMenus.concat(decorated);
    }
  }

  return {
    recipes: (recipes.results ?? []).map(project).concat(sharedRecipes),
    events: (events.results ?? []).map(project).concat(sharedEvents),
    menus: (menus.results ?? []).map(project).concat(sharedMenus),
    allergen_audits: (audits.results ?? []).map(project),
    serverNow: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// push — upsert a batch of client deltas, applying LWW per row.
//
// Returns a per-row status array so the client can flip its local `synced`
// flag selectively (only 'applied' rows are confirmed; 'stale' means server
// has a newer copy that the next pull will deliver; 'rejected' means the
// row didn't satisfy validation/size limits and the client should surface
// the error).
// ---------------------------------------------------------------------------
export async function push(
  db: D1Database,
  userId: string,
  body: unknown,
): Promise<PushResult[]> {
  if (!body || typeof body !== 'object') {
    throw new SyncValidationError('Body must be JSON');
  }
  const b = body as Partial<Record<SyncTable, unknown>>;

  // Collect all incoming rows across all tables for upfront size check.
  const inputs: Array<{ table: SyncTable; row: PushRowInput }> = [];
  for (const table of SYNC_TABLES) {
    const arr = b[table];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      throw new SyncValidationError(`${table} must be an array`);
    }
    for (const r of arr) {
      if (!isPushRow(r)) {
        throw new SyncValidationError(`${table} row missing required fields (id, updated_at, payload)`);
      }
      inputs.push({ table, row: r });
    }
  }

  if (inputs.length > MAX_ROWS_PER_PUSH) {
    throw new SyncValidationError(`Too many rows in one push (max ${MAX_ROWS_PER_PUSH}); split into batches`);
  }

  const results: PushResult[] = [];

  // Sequential per row — D1 supports prepared-statement batching but the
  // LWW guard requires a per-row read first, which is hard to batch safely.
  // At v1 scale (<200 rows/push) the sequential cost is acceptable.
  for (const { table, row } of inputs) {
    const result = await upsertRow(db, userId, table, row);
    results.push(result);
  }

  return results;
}

async function upsertRow(
  db: D1Database,
  userId: string,
  table: SyncTable,
  row: PushRowInput,
): Promise<PushResult> {
  const payloadStr = JSON.stringify(row.payload);
  if (payloadStr.length > MAX_PAYLOAD_BYTES) {
    return {
      table,
      id: row.id,
      status: 'rejected',
      reason: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${payloadStr.length})`,
    };
  }

  // Read existing row to enforce LWW.
  const existing = await db
    .prepare(`SELECT updated_at FROM ${table} WHERE user_id = ? AND id = ?`)
    .bind(userId, row.id)
    .first<{ updated_at: number } | null>();

  if (existing && row.updated_at <= existing.updated_at) {
    return { table, id: row.id, status: 'stale' };
  }

  const isDeleted = row.is_deleted === true || row.is_deleted === 1 ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO ${table} (id, user_id, updated_at, is_deleted, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         updated_at = excluded.updated_at,
         is_deleted = excluded.is_deleted,
         payload    = excluded.payload`,
    )
    .bind(row.id, userId, row.updated_at, isDeleted, payloadStr)
    .run();

  return { table, id: row.id, status: 'applied' };
}

/** Exported for the route handler to validate the URL search-param. */
export function parseSince(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export { isTable };
