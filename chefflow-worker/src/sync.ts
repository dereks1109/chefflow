// Sync endpoints for /api/sync/pull and /api/sync/push. Both auth via
// verifyClerkRequest in index.ts; this module only handles parsing and D1
// I/O. See chefflow-worker/migrations/0001_init.sql for the schema.

export interface SyncRowIn {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
  // Full Recipe/KitchenEvent JSON. The worker doesn't introspect it.
  [key: string]: unknown;
}

export interface PushBody {
  recipes?: SyncRowIn[];
  events?: SyncRowIn[];
}

export interface SyncRowOut {
  id: string;
  updatedAt: number;
  serverVersion: number;
  deletedAt: number | null;
  payload: Record<string, unknown>;
}

export interface PullResponse {
  recipes: SyncRowOut[];
  events: SyncRowOut[];
  serverNow: number;
}

export interface PushResponse {
  // Per-id serverVersion the server applied — null when the server kept
  // its existing row because the incoming updatedAt was older.
  recipes: Record<string, number | null>;
  events: Record<string, number | null>;
  serverNow: number;
}

// A clock-injection seam so tests can produce deterministic serverVersion
// values without mocking Date.
type NowFn = () => number;

export async function handlePull(
  db: D1Database,
  userId: string,
  since: number,
  now: NowFn = Date.now,
): Promise<PullResponse> {
  const [recipes, events] = await Promise.all([
    selectSince(db, 'recipes', userId, since),
    selectSince(db, 'events', userId, since),
  ]);
  return { recipes, events, serverNow: now() };
}

async function selectSince(
  db: D1Database,
  table: 'recipes' | 'events',
  userId: string,
  since: number,
): Promise<SyncRowOut[]> {
  const sql = `SELECT id, updated_at, server_version, deleted_at, payload
               FROM ${table}
               WHERE owner_id = ? AND server_version > ?
               ORDER BY server_version`;
  const result = await db.prepare(sql).bind(userId, since).all<{
    id: string;
    updated_at: number;
    server_version: number;
    deleted_at: number | null;
    payload: string;
  }>();
  const rows = result.results ?? [];
  return rows.map((r) => ({
    id: r.id,
    updatedAt: r.updated_at,
    serverVersion: r.server_version,
    deletedAt: r.deleted_at,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  }));
}

export async function handlePush(
  db: D1Database,
  userId: string,
  body: PushBody,
  now: NowFn = Date.now,
): Promise<PushResponse> {
  const recipesResult: Record<string, number | null> = {};
  const eventsResult: Record<string, number | null> = {};

  for (const row of body.recipes ?? []) {
    recipesResult[row.id] = await upsertRow(db, 'recipes', userId, row, now);
  }
  for (const row of body.events ?? []) {
    eventsResult[row.id] = await upsertRow(db, 'events', userId, row, now);
  }
  return { recipes: recipesResult, events: eventsResult, serverNow: now() };
}

// LWW: write only if incoming.updatedAt >= stored.updated_at. Tombstones
// (deletedAt set) propagate the same way — the row stays in the table so
// later /pull calls return the delete to other devices.
async function upsertRow(
  db: D1Database,
  table: 'recipes' | 'events',
  userId: string,
  row: SyncRowIn,
  now: NowFn,
): Promise<number | null> {
  if (!row.id || typeof row.id !== 'string') return null;
  if (typeof row.updatedAt !== 'number') return null;

  const existing = await db.prepare(
    `SELECT updated_at FROM ${table} WHERE owner_id = ? AND id = ?`,
  ).bind(userId, row.id).first<{ updated_at: number }>();

  if (existing && existing.updated_at > row.updatedAt) {
    return null; // server wins
  }

  const serverVersion = now();
  const deletedAt = typeof row.deletedAt === 'number' ? row.deletedAt : null;
  // Strip the dirty flag — that's a client-local concept and shouldn't be
  // stored on the server (it would round-trip back to other devices and
  // mark their copies dirty).
  const payload = { ...row };
  delete (payload as Record<string, unknown>).dirty;

  await db.prepare(
    `INSERT INTO ${table} (id, owner_id, updated_at, server_version, deleted_at, payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, id) DO UPDATE SET
       updated_at = excluded.updated_at,
       server_version = excluded.server_version,
       deleted_at = excluded.deleted_at,
       payload = excluded.payload`,
  ).bind(
    row.id,
    userId,
    row.updatedAt,
    serverVersion,
    deletedAt,
    JSON.stringify(payload),
  ).run();

  return serverVersion;
}
