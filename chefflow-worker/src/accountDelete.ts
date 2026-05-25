// GDPR Article 17 — Right to Erasure ("right to be forgotten").
//
// Cascade in this order so we don't leave dangling state if a later step
// fails:
//   1. D1: delete recipes / events / menus / allergen_audits where user_id = ?
//   2. KV: unpublish every community recipe authored by this user
//   3. KV: remove the demos:provisioned:* marker so a re-signup gets a
//      fresh seed
//   4. Clerk: DELETE /v1/users/<id> — this also revokes all sessions
//      server-side, so the SPA's next request returns 401 and the user
//      is bounced to sign-in.
//
// Returns counts for telemetry and for the SPA's confirmation toast
// ("Deleted N recipes, M events, …"). On failure we surface the step
// that broke so the user can retry — partial deletion is acceptable
// (the user can re-run the route) but unfindable state is not.

import type { FetchLike } from './tier';
import { get as communityGet, unpublish as communityUnpublish } from './community';

export type SyncTable = 'recipes' | 'events' | 'menus' | 'allergen_audits';

export interface DeleteAccountResult {
  deleted: Record<SyncTable, number>;
  communityRecipesUnpublished: number;
  clerkDeleted: boolean;
}

export class AccountDeleteError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = 'AccountDeleteError';
  }
}

const TABLES: SyncTable[] = ['recipes', 'events', 'menus', 'allergen_audits'];
const DEMOS_MARKER_PREFIX = 'demos:provisioned:v2:';

async function deleteTable(db: D1Database, userId: string, table: SyncTable): Promise<number> {
  // We use the rows-changed count for the response. SQLite reports it via
  // meta.changes; some D1 versions also expose meta.changed_rows.
  const res = await db
    .prepare(`DELETE FROM ${table} WHERE user_id = ?`)
    .bind(userId)
    .run();
  const changes = (res.meta?.changes ?? res.meta?.changed_rows ?? 0) as number;
  return changes;
}

async function unpublishUserCommunityRecipes(kv: KVNamespace, userId: string): Promise<number> {
  const indexRaw = await kv.get('c:i:byPublishedDesc');
  if (!indexRaw) return 0;
  let index: Array<{ id: string }>;
  try {
    index = JSON.parse(indexRaw) as Array<{ id: string }>;
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of index) {
    const record = await communityGet(kv, entry.id);
    if (!record) continue;
    if (record.authorClerkId !== userId) continue;
    await communityUnpublish(kv, userId, entry.id);
    count += 1;
  }
  return count;
}

async function deleteClerkUser(userId: string, clerkSecret: string, fetchImpl: FetchLike): Promise<boolean> {
  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  // Clerk returns 200 + a "deleted: true" payload, or 404 if the user is
  // already gone. We treat 404 as success (idempotent delete).
  if (res.ok || res.status === 404) return true;
  let detail = '';
  try { detail = await res.text(); } catch { /* ignore */ }
  throw new AccountDeleteError(
    `Clerk user delete failed (${res.status}): ${detail.slice(0, 200)}`,
    res.status,
  );
}

export async function deleteAccount(
  db: D1Database,
  kv: KVNamespace,
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<DeleteAccountResult> {
  // 1. D1 cascade
  const deleted = {} as Record<SyncTable, number>;
  for (const table of TABLES) {
    deleted[table] = await deleteTable(db, userId, table);
  }

  // 2. Community recipes
  const communityRecipesUnpublished = await unpublishUserCommunityRecipes(kv, userId);

  // 3. Demos marker — so a future fresh sign-in with the same userId
  //    (Clerk reuses ids? It doesn't, but defensive) re-seeds demos.
  await kv.delete(`${DEMOS_MARKER_PREFIX}${userId}`);

  // 4. Clerk
  const clerkDeleted = await deleteClerkUser(userId, clerkSecret, fetchImpl);

  return { deleted, communityRecipesUnpublished, clerkDeleted };
}
