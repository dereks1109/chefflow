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

// ---------------------------------------------------------------------------
// pull — fetch all rows for the verified user updated after `since`.
// ---------------------------------------------------------------------------
export async function pull(
  db: D1Database,
  userId: string,
  since: number,
): Promise<PullResponse> {
  if (!Number.isFinite(since) || since < 0) since = 0;

  const sql = (table: SyncTable) =>
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
    sql('recipes'),
    sql('events'),
    sql('menus'),
    sql('allergen_audits'),
  ]);

  const project = (r: { id: string; updated_at: number; is_deleted: number; payload: string }): SyncRow => ({
    id: r.id,
    updated_at: r.updated_at,
    is_deleted: r.is_deleted ? 1 : 0,
    payload: r.payload,
  });

  return {
    recipes: (recipes.results ?? []).map(project),
    events: (events.results ?? []).map(project),
    menus: (menus.results ?? []).map(project),
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
