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
  /** T6 — id of the team that satisfied the per-row sharedWithGroup
   *  Ids filter for THIS viewer. When the recipe is shared with
   *  multiple teams the viewer belongs to, we pick the first one.
   *  Empty on the caller's own rows. */
  team_id?: string;
  /** T6 — the matched team's display name, looked up server-side
   *  during the pull so the member's SPA doesn't need a separate
   *  /api/teams/groups call to resolve names for the card tag. */
  team_name?: string;
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

/** T7 — throwing variant used as a defensive guard wherever `${table}`
 *  is interpolated into SQL. Today every caller already passes a
 *  SyncTable from the const tuple, so this is belt-and-braces against
 *  future call sites that take user input. */
export function assertSyncTable(t: string): asserts t is SyncTable {
  if (!isTable(t)) {
    throw new SyncValidationError(`Invalid sync table: ${t}`);
  }
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

    /** Returns the (row, matchedGroupId) pairs where the matched id
     *  is the FIRST entry in the row's sharedWithGroupIds that's also
     *  in the viewer's allowed set. Multi-team rows pick the first
     *  match deterministically (sharedWithGroupIds is array-ordered
     *  by the chef's tick order). */
    const filterByGroup = (
      rows: { id: string; updated_at: number; is_deleted: number; payload: string }[],
      allowedGroupIds: Set<string>,
    ): { row: typeof rows[number]; matchedGroupId: string }[] => {
      const matched: { row: typeof rows[number]; matchedGroupId: string }[] = [];
      for (const r of rows) {
        let parsed: { sharedWithGroupIds?: unknown };
        try {
          parsed = JSON.parse(r.payload) as { sharedWithGroupIds?: unknown };
        } catch {
          continue;
        }
        const list = parsed.sharedWithGroupIds;
        if (!Array.isArray(list)) continue;
        for (const g of list) {
          if (typeof g === 'string' && allowedGroupIds.has(g)) {
            matched.push({ row: r, matchedGroupId: g });
            break;
          }
        }
      }
      return matched;
    };

    // T6 — preload (groupId → groupName) per owner so the row
    // decoration below can include team_name without an extra
    // round-trip. One small SELECT per owner; bounded by the
    // owner's group count.
    const groupNamesByOwner = new Map<string, Map<string, string>>();
    await Promise.all(
      Array.from(groupsByOwner.keys()).map(async (ownerId) => {
        const res = await db
          .prepare(`SELECT id, name FROM groups WHERE owner_user_id = ?`)
          .bind(ownerId)
          .all<{ id: string; name: string }>();
        const map = new Map<string, string>();
        for (const g of res.results ?? []) map.set(g.id, g.name);
        groupNamesByOwner.set(ownerId, map);
      }),
    );

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
              matched: filterByGroup(res.results ?? [], allowedGroupIds),
            })),
        ),
    );
    const sharedResults = await Promise.all(sharedPromises);
    for (const s of sharedResults) {
      const nameMap = groupNamesByOwner.get(s.ownerId) ?? new Map<string, string>();
      const decorated: SyncRow[] = s.matched.map(({ row, matchedGroupId }) => ({
        ...project(row),
        owner_user_id: s.ownerId,
        read_only: 1 as const,
        team_id: matchedGroupId,
        team_name: nameMap.get(matchedGroupId),
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
/** Callback fired AFTER a recipe/event upsert that adds new groupIds to
 *  the row's `sharedWithGroupIds`. The route handler wraps it in
 *  `ctx.waitUntil(...)` so emails fan out non-blockingly; tests pass a
 *  plain spy. Kept purely synchronous in signature — implementations
 *  can return a Promise that the route handler tracks. */
export interface ShareNotificationContext {
  table: 'recipes' | 'events';
  rowId: string;
  ownerUserId: string;
  addedGroupIds: string[];
  /** Serialized JSON of the row that was just upserted. Avoids the
   *  notifier re-querying D1 to pull the title / dish list. */
  newPayload: string;
}
export type ShareNotifier = (ctx: ShareNotificationContext) => void;

export async function push(
  db: D1Database,
  userId: string,
  body: unknown,
  notifier?: ShareNotifier,
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
    const result = await upsertRow(db, userId, table, row, notifier);
    results.push(result);
  }

  return results;
}

function readSharedGroupIds(payloadStr: string | undefined | null): string[] {
  if (!payloadStr) return [];
  try {
    const parsed = JSON.parse(payloadStr) as { sharedWithGroupIds?: unknown };
    const ids = parsed?.sharedWithGroupIds;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

async function upsertRow(
  db: D1Database,
  userId: string,
  table: SyncTable,
  row: PushRowInput,
  notifier?: ShareNotifier,
): Promise<PushResult> {
  // T7 — runtime guard even though `table: SyncTable` is type-safe.
  // Belt-and-braces in case a future caller bypasses the type system.
  assertSyncTable(table);
  const payloadStr = JSON.stringify(row.payload);
  if (payloadStr.length > MAX_PAYLOAD_BYTES) {
    return {
      table,
      id: row.id,
      status: 'rejected',
      reason: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${payloadStr.length})`,
    };
  }

  // Read existing row to enforce LWW. Also pull `payload` so we can diff
  // sharedWithGroupIds against the new payload below (fires the share
  // notifier when the chef adds a new group to a recipe/event).
  const existing = await db
    .prepare(`SELECT updated_at, payload FROM ${table} WHERE user_id = ? AND id = ?`)
    .bind(userId, row.id)
    .first<{ updated_at: number; payload: string } | null>();

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

  // Share notification — only recipes and events carry sharedWithGroupIds.
  // Fire the notifier for groupIds that are newly present (first-share
  // and re-share-after-unshare both count). Skip on deletes — we don't
  // notify a team that a share was *removed*.
  if (notifier && !isDeleted && (table === 'recipes' || table === 'events')) {
    const oldGroupIds = readSharedGroupIds(existing?.payload);
    const newGroupIds = readSharedGroupIds(payloadStr);
    const addedGroupIds = newGroupIds.filter((g) => !oldGroupIds.includes(g));
    if (addedGroupIds.length > 0) {
      notifier({
        table,
        rowId: row.id,
        ownerUserId: userId,
        addedGroupIds,
        newPayload: payloadStr,
      });
    }
  }

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
