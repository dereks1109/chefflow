// Account-level data endpoints. Both auth via verifyClerkRequest in
// index.ts — owner isolation is enforced by every query filtering on
// `owner_id = ?` from the JWT's `sub` claim.
//
//   DELETE /api/account  → hard-delete every row owned by the caller across
//                          recipes, events, user_prefs. Returns counts.
//                          Use case: GDPR Art. 17 right to erasure.
//
//   GET /api/account/export → return the caller's full row set across the
//                             same three tables as JSON, intended to be
//                             downloaded as a portable backup.
//                             Use case: GDPR Art. 20 portability.

export interface DeleteResponse {
  deleted: {
    recipes: number;
    events: number;
    user_prefs: number;
  };
}

export interface ExportRow {
  id: string;
  updatedAt: number;
  serverVersion: number;
  deletedAt: number | null;
  payload: Record<string, unknown>;
}

export interface ExportResponse {
  ownerId: string;
  exportedAt: number;
  recipes: ExportRow[];
  events: ExportRow[];
  prefs: ExportRow[];
}

export async function handleDeleteAccount(
  db: D1Database,
  userId: string,
): Promise<DeleteResponse> {
  // Hard delete — the user is leaving, so no tombstones. Other devices
  // signed in with the same Clerk user will lose their local copies the
  // next time the client checks for the user (Clerk also deletes them).
  const [recipes, events, prefs] = await Promise.all([
    db.prepare('DELETE FROM recipes WHERE owner_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM events WHERE owner_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM user_prefs WHERE owner_id = ?').bind(userId).run(),
  ]);
  return {
    deleted: {
      recipes: recipes.meta.changes ?? 0,
      events: events.meta.changes ?? 0,
      user_prefs: prefs.meta.changes ?? 0,
    },
  };
}

export async function handleExportAccount(
  db: D1Database,
  userId: string,
  now: () => number = Date.now,
): Promise<ExportResponse> {
  const [recipes, events, prefs] = await Promise.all([
    selectAll(db, 'recipes', userId),
    selectAll(db, 'events', userId),
    selectAll(db, 'user_prefs', userId),
  ]);
  return {
    ownerId: userId,
    exportedAt: now(),
    recipes,
    events,
    prefs,
  };
}

async function selectAll(
  db: D1Database,
  table: 'recipes' | 'events' | 'user_prefs',
  userId: string,
): Promise<ExportRow[]> {
  const result = await db.prepare(
    `SELECT id, updated_at, server_version, deleted_at, payload
     FROM ${table}
     WHERE owner_id = ?
     ORDER BY updated_at`,
  ).bind(userId).all<{
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
