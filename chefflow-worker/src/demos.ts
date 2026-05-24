// Idempotent demo provisioning: writes the canonical demo recipes + event
// into D1 under the caller's user_id on first sign-in. Behavior:
//   - KV marker `demos:provisioned:v2:<userId>` fast-skips repeat callers.
//   - RECIPES use INSERT OR IGNORE so any recipes the user has edited stay
//     intact. Soft-deleted demos do NOT resurrect — the tombstone row
//     (is_deleted=1) wins the conflict.
//   - The DEMO EVENT uses a full UPSERT instead. The chef explicitly wants
//     the canonical event (budget + dish lineup) to be authoritative across
//     content updates, so when the seed shape changes (v2: £600 + 5 dishes
//     vs v1: £50 + 2 dishes), the new shape overwrites the user's row.
//   - Returns the number of rows newly inserted / upserted, so the SPA can
//     show "Loaded N demo recipes" or stay silent on a repeat call.
//
// MARKER VERSIONING: when the canonical demo content changes in a way that
// existing users should see, bump the prefix (e.g. v2 → v3). The old marker
// becomes orphan — KV TTL eventually evicts it.

import { buildDemoRecipes, buildDemoEvents } from './demoSeed';

const MARKER_TTL_SECONDS = 60 * 60 * 24 * 365 * 5; // 5y — effectively forever.
const MARKER_KEY_PREFIX = 'demos:provisioned:v2:';

function markerKey(userId: string): string {
  return `${MARKER_KEY_PREFIX}${userId}`;
}

export interface ProvisionResult {
  alreadyProvisioned: boolean;
  recipesInserted: number;
  eventsInserted: number;
}

export interface DemosEnv {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
}

export async function provisionDemosForUser(
  env: DemosEnv,
  userId: string,
): Promise<ProvisionResult> {
  const marker = await env.RATE_LIMIT.get(markerKey(userId));
  if (marker === '1') {
    return { alreadyProvisioned: true, recipesInserted: 0, eventsInserted: 0 };
  }

  const now = Date.now();
  const recipes = buildDemoRecipes(now);
  const events = buildDemoEvents(now);

  let recipesInserted = 0;
  for (const r of recipes) {
    const inserted = await insertOrIgnoreRow(env.DB, 'recipes', userId, r.id, now, JSON.stringify(r));
    if (inserted) recipesInserted += 1;
  }

  // Events use UPSERT so the canonical demo event (e_demo_main) follows
  // the seed shape over time. Counts as "inserted" regardless of whether
  // the row was newly created or overwritten — the semantics are "we
  // wrote it".
  let eventsInserted = 0;
  for (const e of events) {
    await upsertRow(env.DB, 'events', userId, e.id, now, JSON.stringify(e));
    eventsInserted += 1;
  }

  await env.RATE_LIMIT.put(markerKey(userId), '1', { expirationTtl: MARKER_TTL_SECONDS });

  return { alreadyProvisioned: false, recipesInserted, eventsInserted };
}

async function insertOrIgnoreRow(
  db: D1Database,
  table: 'recipes' | 'events',
  userId: string,
  id: string,
  updatedAt: number,
  payload: string,
): Promise<boolean> {
  // INSERT OR IGNORE on the (user_id, id) primary key. SQLite returns
  // changes() === 0 when the row already exists and was skipped, 1 when a
  // new row was inserted. We surface that to the caller for telemetry.
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO ${table} (id, user_id, updated_at, is_deleted, payload)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .bind(id, userId, updatedAt, payload)
    .run();
  // D1 reports affected rows via meta.changes (Cloudflare D1 result shape).
  const changes = (result.meta?.changes ?? result.meta?.changed_rows ?? 0) as number;
  return changes > 0;
}

async function upsertRow(
  db: D1Database,
  table: 'recipes' | 'events',
  userId: string,
  id: string,
  updatedAt: number,
  payload: string,
): Promise<void> {
  // Mirrors the sync engine's upsert (ON CONFLICT DO UPDATE) so the demo
  // row tracks the latest canonical shape. The is_deleted=0 reset is
  // intentional: if the chef previously tombstoned the event, the v2
  // provisioning brings it back. Acceptable per the locked decision —
  // demo event is a managed surface, not user content.
  await db
    .prepare(
      `INSERT INTO ${table} (id, user_id, updated_at, is_deleted, payload)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         updated_at = excluded.updated_at,
         is_deleted = 0,
         payload    = excluded.payload`,
    )
    .bind(id, userId, updatedAt, payload)
    .run();
}
