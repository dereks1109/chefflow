// GDPR Article 17 — Right to Erasure ("right to be forgotten").
//
// Cascade in this order so we don't leave dangling state if a later step
// fails:
//   1. D1: delete recipes / events / menus / allergen_audits where user_id = ?
//   2. D1: delete team_memberships rows where user is the owner OR member,
//      and delete groups rows where user is owner (T7).
//   3. KV: unpublish every community recipe authored by this user
//   4. KV: remove the demos:provisioned:* marker AND the T5 group
//      cleanup marker so a re-signup gets a fresh seed
//   5. Clerk: DELETE /v1/users/<id> — this also revokes all sessions
//      server-side, so the SPA's next request returns 401 and the user
//      is bounced to sign-in.
//
// Returns counts for telemetry and for the SPA's confirmation toast
// ("Deleted N recipes, M events, …"). On failure we surface the step
// that broke so the user can retry — partial deletion is acceptable
// (the user can re-run the route) but unfindable state is not.

import type { FetchLike } from './tier';
import { get as communityGet, unpublish as communityUnpublish } from './community';
import { assertSyncTable, type SyncTable } from './sync';

export type { SyncTable };

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
// T7 — kept in sync with `MARKER_KEY_PREFIX` in src/demos.ts. Earlier
// this was 'v2:' (a stale leftover), so a deleted-then-resigned-up
// user wouldn't get fresh demos because the v5 marker still pointed
// at "already provisioned". Bumped to match.
const DEMOS_MARKER_PREFIX = 'demos:provisioned:v5:';

async function deleteTable(db: D1Database, userId: string, table: SyncTable): Promise<number> {
  // T7 — runtime guard even though `table: SyncTable` is type-safe.
  // Belt-and-braces against a future caller bypassing the type system.
  assertSyncTable(table);
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
  // 1. D1 cascade — recipes / events / menus / allergen_audits.
  const deleted = {} as Record<SyncTable, number>;
  for (const table of TABLES) {
    deleted[table] = await deleteTable(db, userId, table);
  }

  // 2. Teams cascade (T7) — remove every membership where the user
  //    is the owner OR a member, plus any groups they own. Don't
  //    leave invitee email addresses or team metadata behind.
  await db
    .prepare(`DELETE FROM team_memberships WHERE owner_user_id = ? OR member_user_id = ?`)
    .bind(userId, userId)
    .run();
  await db
    .prepare(`DELETE FROM groups WHERE owner_user_id = ?`)
    .bind(userId)
    .run();

  // 3. Community recipes
  const communityRecipesUnpublished = await unpublishUserCommunityRecipes(kv, userId);

  // 4. KV markers — demos provisioning + the T5 group-cleanup marker
  //    so a future fresh sign-in with the same userId re-seeds + re-
  //    runs cleanup correctly.
  await kv.delete(`${DEMOS_MARKER_PREFIX}${userId}`);
  await kv.delete(`groups:t5-cleanup:v1:${userId}`);

  // 5. Clerk
  const clerkDeleted = await deleteClerkUser(userId, clerkSecret, fetchImpl);

  return { deleted, communityRecipesUnpublished, clerkDeleted };
}
