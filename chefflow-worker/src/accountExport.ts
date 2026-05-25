// GDPR Article 20 — Right to Data Portability. Returns a single JSON
// document containing every D1 row owned by the caller across the four
// synced tables (recipes, events, menus, allergen_audits), plus any
// community-published recipes authored by the caller from KV. Caller can
// download and import into another service.
//
// We deliberately INCLUDE tombstoned rows (is_deleted=1) — a portability
// export is supposed to be the full picture, and a deleted row is still
// "data we hold." We do NOT include rows from other users (PK enforces
// `user_id = ?` filter).

export type SyncTable = 'recipes' | 'events' | 'menus' | 'allergen_audits';

export interface SyncRowExport {
  id: string;
  updated_at: number;
  is_deleted: 0 | 1;
  payload: unknown; // already-parsed JSON, not the raw string
}

export interface AccountExportPayload {
  userId: string;
  exportedAt: number;
  schemaVersion: 1;
  tables: Record<SyncTable, SyncRowExport[]>;
  communityRecipes: unknown[];
}

const TABLES: SyncTable[] = ['recipes', 'events', 'menus', 'allergen_audits'];

async function exportTable(db: D1Database, userId: string, table: SyncTable): Promise<SyncRowExport[]> {
  const res = await db
    .prepare(
      `SELECT id, updated_at, is_deleted, payload
         FROM ${table}
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<{ id: string; updated_at: number; is_deleted: 0 | 1; payload: string }>();

  return (res.results ?? []).map((row) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      parsed = { _raw: row.payload, _parseError: true };
    }
    return {
      id: row.id,
      updated_at: row.updated_at,
      is_deleted: row.is_deleted,
      payload: parsed,
    };
  });
}

async function exportCommunityRecipes(kv: KVNamespace, userId: string): Promise<unknown[]> {
  // KV doesn't index by author — we walk the global community index and
  // filter. For v1 the community library is tiny so this is fine; revisit
  // when it grows past a few hundred rows.
  const indexRaw = await kv.get('c:i:byPublishedDesc');
  if (!indexRaw) return [];
  let index: Array<{ id: string }>;
  try {
    index = JSON.parse(indexRaw) as Array<{ id: string }>;
  } catch {
    return [];
  }
  const mine: unknown[] = [];
  for (const entry of index) {
    const raw = await kv.get(`c:r:${entry.id}`);
    if (!raw) continue;
    try {
      const record = JSON.parse(raw) as { authorClerkId?: string };
      if (record.authorClerkId === userId) mine.push(record);
    } catch {
      // skip malformed entries
    }
  }
  return mine;
}

export async function exportAccount(
  db: D1Database,
  kv: KVNamespace,
  userId: string,
  now: number = Date.now(),
): Promise<AccountExportPayload> {
  const tableResults = await Promise.all(TABLES.map((t) => exportTable(db, userId, t)));
  const tables = TABLES.reduce<Record<SyncTable, SyncRowExport[]>>((acc, t, i) => {
    acc[t] = tableResults[i];
    return acc;
  }, {} as Record<SyncTable, SyncRowExport[]>);

  const communityRecipes = await exportCommunityRecipes(kv, userId);

  return {
    userId,
    exportedAt: now,
    schemaVersion: 1,
    tables,
    communityRecipes,
  };
}
