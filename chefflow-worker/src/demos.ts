// Idempotent demo provisioning: writes the canonical demo recipes + event
// into D1 under the caller's user_id on first sign-in. Behavior:
//   - KV marker `demos:provisioned:v5:<userId>` fast-skips repeat callers.
//   - On v5 first-touch (existing v2/v3/v4 users + brand-new users) we run
//     a one-shot cleanup pass BEFORE the INSERT loop:
//       1. Tombstone every id in RETIRED_DEMO_RECIPE_IDS (e.g. the
//          discontinued (Demo) Mango Sorbet). Existing users see the
//          tombstone via the next sync pull → dish drops from library.
//       2. For every active demo recipe id, if a row already exists,
//          rewrite its payload to strip `analysis.allergens` and every
//          ingredient's `allergenFlags`. Aligns with the yesterday's
//          legal de-risk: ChefFlow no longer authors allergen tags;
//          chefs declare them manually.
//   - RECIPES use INSERT OR IGNORE so any recipes the user has edited stay
//     intact across fields other than allergens. Soft-deleted demos do
//     NOT resurrect — the tombstone row (is_deleted=1) wins the conflict.
//   - The DEMO EVENT uses a full UPSERT instead.
//   - Returns the number of rows newly inserted / upserted, so the SPA can
//     show "Loaded N demo recipes" or stay silent on a repeat call.
//
// MARKER VERSIONING: when the canonical demo content changes in a way that
// existing users should see, bump the prefix (e.g. v4 → v5). The old marker
// becomes orphan — KV TTL eventually evicts it.
//
// v5 (2026-05-28): demo event gains a `notesOriginal` field so the
// notes-provenance hover popover demos out-of-the-box (existing v4 users
// re-provision via the standard event UPSERT in the loop below).

import { buildDemoRecipes, buildDemoEvents } from './demoSeed';

const MARKER_TTL_SECONDS = 60 * 60 * 24 * 365 * 5; // 5y — effectively forever.
const MARKER_KEY_PREFIX = 'demos:provisioned:v5:';

// Demo recipe ids that USED to be in buildDemoRecipes() but are no longer
// shipped. The cleanup pass tombstones any existing rows so users who
// previously received them see the deletion on the next sync.
const RETIRED_DEMO_RECIPE_IDS = ['r_demo_mango_sorbet'] as const;

function markerKey(userId: string): string {
  return `${MARKER_KEY_PREFIX}${userId}`;
}

export interface ProvisionResult {
  alreadyProvisioned: boolean;
  recipesInserted: number;
  eventsInserted: number;
  recipesUpdated: number;        // retroactive allergen-strip count
  recipesTombstoned: number;     // retired demo id count
  /** Tombstoned demo recipes un-deleted by the force pass. 0 in normal
   *  first-sign-in flow; non-zero only when called via Settings'
   *  "Restore demo content" button after the chef deleted demos. */
  recipesUntombstoned: number;
}

export interface DemosEnv {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
}

export interface ProvisionOpts {
  /** When true, also revive tombstoned demo recipes by rewriting their
   *  payload back to the canonical version + flipping is_deleted to 0.
   *  Active (non-tombstoned) chef-edited copies are NOT touched —
   *  edits survive. Used by the /api/demos/provision?force=1 route
   *  that the Settings button hits. */
  force?: boolean;
}

export async function provisionDemosForUser(
  env: DemosEnv,
  userId: string,
  opts: ProvisionOpts = {},
): Promise<ProvisionResult> {
  const marker = await env.RATE_LIMIT.get(markerKey(userId));
  if (marker === '1' && !opts.force) {
    return {
      alreadyProvisioned: true,
      recipesInserted: 0,
      eventsInserted: 0,
      recipesUpdated: 0,
      recipesTombstoned: 0,
      recipesUntombstoned: 0,
    };
  }

  const now = Date.now();
  const recipes = buildDemoRecipes(now);
  const events = buildDemoEvents(now);

  // ---- Cleanup pass (one-shot per user on first v3 touch). ----
  // 1. Tombstone retired demo recipe ids that the user might still have.
  let recipesTombstoned = 0;
  for (const retiredId of RETIRED_DEMO_RECIPE_IDS) {
    const res = await env.DB
      .prepare(
        `UPDATE recipes
           SET is_deleted = 1, updated_at = ?
           WHERE user_id = ? AND id = ? AND is_deleted = 0`,
      )
      .bind(now, userId, retiredId)
      .run();
    const changes = (res.meta?.changes ?? res.meta?.changed_rows ?? 0) as number;
    recipesTombstoned += changes;
  }

  // 2. Strip allergens from any existing copies of currently-active demo recipes.
  let recipesUpdated = 0;
  for (const r of recipes) {
    const updated = await stripAllergensIfExists(env.DB, userId, r.id, now);
    if (updated) recipesUpdated += 1;
  }

  // 3. Force-mode only: un-tombstone any demo recipes the chef previously
  //    deleted. Targets is_deleted=1 rows ONLY so chef edits on active
  //    rows survive. Done BEFORE INSERT OR IGNORE so the next step
  //    doesn't no-op on a tombstoned row.
  let recipesUntombstoned = 0;
  if (opts.force) {
    for (const r of recipes) {
      const res = await env.DB
        .prepare(
          `UPDATE recipes
             SET is_deleted = 0, payload = ?, updated_at = ?
             WHERE user_id = ? AND id = ? AND is_deleted = 1`,
        )
        .bind(JSON.stringify(r), now, userId, r.id)
        .run();
      const changes = (res.meta?.changes ?? res.meta?.changed_rows ?? 0) as number;
      recipesUntombstoned += changes;
    }
  }

  // ---- Standard provisioning (idempotent across users + content versions). ----
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

  return {
    alreadyProvisioned: false,
    recipesInserted,
    eventsInserted,
    recipesUpdated,
    recipesTombstoned,
    recipesUntombstoned,
  };
}

/**
 * If `(userId, recipeId)` has an active row in D1, rewrite its payload to
 * remove `analysis.allergens` and every ingredient's `allergenFlags`.
 * Returns true when an update happened, false when the row didn't exist
 * (the subsequent INSERT OR IGNORE will plant a fresh one for new users).
 *
 * NOTE: this is intentionally surgical — we keep all other chef edits
 * (title, ingredients other than allergenFlags, steps, calories,
 * keyIngredientTags, pricePerPortion, coverPhoto…) so a chef who tuned a
 * demo recipe keeps their work. Only allergen data is wiped.
 */
async function stripAllergensIfExists(
  db: D1Database,
  userId: string,
  recipeId: string,
  now: number,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT payload FROM recipes WHERE user_id = ? AND id = ? AND is_deleted = 0`)
    .bind(userId, recipeId)
    .first<{ payload: string }>();
  if (!row) return false;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return false; // unreadable row — leave alone, don't corrupt further.
  }

  let dirty = false;
  const analysis = parsed.analysis as { allergens?: unknown; uncertainIngredients?: unknown } | undefined;
  if (analysis && 'allergens' in analysis) {
    delete analysis.allergens;
    dirty = true;
  }
  if (analysis && 'uncertainIngredients' in analysis) {
    delete analysis.uncertainIngredients;
    dirty = true;
  }
  const ingredients = parsed.ingredients;
  if (Array.isArray(ingredients)) {
    for (const ing of ingredients) {
      if (ing && typeof ing === 'object' && 'allergenFlags' in (ing as Record<string, unknown>)) {
        delete (ing as Record<string, unknown>).allergenFlags;
        dirty = true;
      }
    }
  }
  if (!dirty) return false;

  await db
    .prepare(`UPDATE recipes SET payload = ?, updated_at = ? WHERE user_id = ? AND id = ?`)
    .bind(JSON.stringify(parsed), now, userId, recipeId)
    .run();
  return true;
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
