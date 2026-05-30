// Enterprise team-membership module — T3c Phases 1+2 + T4 Phase 1.
//
// T3c Phase 1: data shape + seat-cap helper (assertCanInvite).
// T3c Phase 2: HTTP handlers for invite / accept / list / delete /
// owners-of-me. Phase 3 plugged owners-of-me into the sync pull so
// members see the owner's recipes/events as read-only rows.
//
// T4 Phase 1 (this commit): groups data model. Every Enterprise owner
// has a lazy-created "Default" group; members belong to a specific
// group; recipes/events/menus opt-in to specific groups via the new
// payload.sharedWithGroupIds field. The sync pull below now filters
// per-(member, group) instead of per-member.

import { TIER_LIMITS, type Tier } from '../../chefflow/src/core/tier/limits';
import { fetchUserTier, type FetchLike } from './tier';
import { sendContactNotification } from './contactMail';

export type TeamRole = 'viewer';

export interface TeamMembership {
  ownerUserId: string;
  memberEmail: string;
  memberUserId: string | null;
  role: TeamRole;
  inviteToken: string;
  invitedAt: number;
  acceptedAt: number | null;
  /** T4 — id of the group this member belongs to. Backfilled lazily
   *  to the owner's Default group when ensureDefaultGroup runs. */
  groupId: string | null;
}

export interface TeamGroup {
  id: string;
  ownerUserId: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
}

export class TeamSeatCapReached extends Error {
  readonly tier: Tier;
  readonly limit: number;
  readonly current: number;
  constructor(tier: Tier, current: number, limit: number) {
    super(`Tier ${tier} seat cap reached (${current}/${limit})`);
    this.name = 'TeamSeatCapReached';
    this.tier = tier;
    this.current = current;
    this.limit = limit;
  }
}

/**
 * Throw TeamSeatCapReached if the owner already has at-or-above their
 * tier's maxSeats quota of memberships. Counts both pending invites
 * AND accepted members — pending seats are "held" so the owner can't
 * over-invite while waiting on accepts.
 *
 * Phase 2's POST /api/teams/invite calls this BEFORE inserting a new
 * row. Tier is read from the owner's Clerk publicMetadata.tier upstream
 * and passed in here — keeps the helper a pure DB-bounded check.
 */
export async function assertCanInvite(
  db: D1Database,
  ownerUserId: string,
  tier: Tier,
): Promise<void> {
  const limit = TIER_LIMITS[tier].maxSeats;
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM team_memberships WHERE owner_user_id = ?')
    .bind(ownerUserId)
    .first<{ n: number }>();
  const current = row?.n ?? 0;
  if (current >= limit) {
    throw new TeamSeatCapReached(tier, current, limit);
  }
}

// ---------------------------------------------------------------------------
// T4 Phase 1 — groups data model + lazy default-group migration
// ---------------------------------------------------------------------------

const DEFAULT_GROUP_NAME = 'Default';

/** Generate an opaque group id. crypto.randomUUID exists in Workers. */
function newGroupId(): string {
  return `grp_${crypto.randomUUID()}`;
}

/**
 * Ensure an Enterprise owner has a Default group. Idempotent: returns
 * the existing default's id on subsequent calls. Also backfills any
 * team_memberships rows that pre-date the T4 migration (group_id NULL)
 * to point at the Default.
 *
 * Called from /api/teams/list, /api/teams/invite, and /api/sync/pull
 * (owner-side) so the migration is invisible — the first owner-side
 * request after deploy provisions everything they need.
 */
export async function ensureDefaultGroup(
  db: D1Database,
  ownerUserId: string,
): Promise<string> {
  const existing = await db
    .prepare(
      `SELECT id FROM groups
       WHERE owner_user_id = ? AND is_default = 1
       LIMIT 1`,
    )
    .bind(ownerUserId)
    .first<{ id: string }>();
  if (existing) {
    // Belt-and-braces backfill: any membership row still pointing at
    // NULL gets stamped with the default group id. Cheap UPDATE that
    // no-ops once the rows are migrated.
    await db
      .prepare(
        `UPDATE team_memberships
         SET group_id = ?
         WHERE owner_user_id = ? AND group_id IS NULL`,
      )
      .bind(existing.id, ownerUserId)
      .run();
    return existing.id;
  }

  const groupId = newGroupId();
  await db
    .prepare(
      `INSERT INTO groups (id, owner_user_id, name, is_default, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .bind(groupId, ownerUserId, DEFAULT_GROUP_NAME, Date.now())
    .run();
  // Backfill memberships in the same transaction (D1 lacks
  // multi-statement transactions on a single .prepare; two .run calls
  // are fine since the second is idempotent).
  await db
    .prepare(
      `UPDATE team_memberships
       SET group_id = ?
       WHERE owner_user_id = ? AND group_id IS NULL`,
    )
    .bind(groupId, ownerUserId)
    .run();
  return groupId;
}

/**
 * T5 one-shot cleanup: undoes T4's "auto-created Default group +
 * everything-auto-ticked" model. Runs lazily on the owner's first
 * sync.pull after the T5 deploy. Steps:
 *   1. Find every default group this owner has.
 *   2. Strip `sharedWithGroupIds` from every recipe/event/menu row
 *      they own (bumping updated_at so members see the change on
 *      their next pull — those items become invisible again until the
 *      chef explicitly re-ticks).
 *   3. Delete memberships that pointed at the soon-to-be-deleted
 *      default groups (members lose the team context; chef re-invites
 *      under the new explicit-team flow).
 *   4. Delete the default groups themselves.
 *   5. Set a new KV marker `groups:t5-cleanup:v1:<ownerUserId>`.
 *
 * Idempotent. If KV is unset the cleanup repeats on every pull, which
 * is still correct (each step short-circuits if there's nothing to do).
 */
export async function cleanupT5DefaultGroup(
  env: { DB: D1Database; RATE_LIMIT: KVNamespace },
  ownerUserId: string,
): Promise<void> {
  const markerKey = `groups:t5-cleanup:v1:${ownerUserId}`;
  try {
    const already = await env.RATE_LIMIT.get(markerKey);
    if (already) return;
  } catch {
    // fall through — re-run is harmless
  }

  // (1) Find this owner's default group ids.
  const defaultGroups = await env.DB
    .prepare(`SELECT id FROM groups WHERE owner_user_id = ? AND is_default = 1`)
    .bind(ownerUserId)
    .all<{ id: string }>();
  const defaultIds = (defaultGroups.results ?? []).map((g) => g.id);

  // (2) Strip sharedWithGroupIds from the owner's recipes/events/menus
  // unconditionally — even if the owner had no default group (because
  // a non-default group may have been removed later), the user-chosen
  // T5 design is "clean slate, chef re-ticks". Safe: any present
  // sharedWithGroupIds at the moment of T5 deploy is, by definition,
  // pre-T5 state we're discarding.
  const tables = ['recipes', 'events', 'menus'] as const;
  for (const table of tables) {
    const rows = await env.DB
      .prepare(
        `SELECT id, payload, updated_at FROM ${table}
         WHERE user_id = ? AND is_deleted = 0`,
      )
      .bind(ownerUserId)
      .all<{ id: string; payload: string; updated_at: number }>();
    for (const r of rows.results ?? []) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(r.payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (!('sharedWithGroupIds' in parsed)) continue; // nothing to clean
      delete parsed.sharedWithGroupIds;
      const nextPayload = JSON.stringify(parsed);
      const nextUpdatedAt = Math.max(r.updated_at + 1, Date.now());
      await env.DB
        .prepare(
          `UPDATE ${table} SET payload = ?, updated_at = ?
           WHERE user_id = ? AND id = ?`,
        )
        .bind(nextPayload, nextUpdatedAt, ownerUserId, r.id)
        .run();
    }
  }

  // (3) + (4) — drop memberships + groups for every default group.
  for (const defaultId of defaultIds) {
    await env.DB
      .prepare(`DELETE FROM team_memberships WHERE owner_user_id = ? AND group_id = ?`)
      .bind(ownerUserId, defaultId)
      .run();
    await env.DB
      .prepare(`DELETE FROM groups WHERE owner_user_id = ? AND id = ?`)
      .bind(ownerUserId, defaultId)
      .run();
  }

  try {
    await env.RATE_LIMIT.put(markerKey, '1');
  } catch {
    // Best-effort; next pull re-runs, idempotent.
  }
}

/**
 * Return the (ownerUserId, groupId) pairs the given member has accepted
 * into. Used by the sync pull to determine which owner content rows
 * the member is entitled to see, filtered down by each row's
 * sharedWithGroupIds. Replaces T3c's getAcceptedOwnersForMember.
 */
export async function getAcceptedGroupPairsForMember(
  db: D1Database,
  memberUserId: string,
): Promise<{ ownerUserId: string; groupId: string }[]> {
  const rows = await db
    .prepare(
      `SELECT owner_user_id, group_id FROM team_memberships
       WHERE member_user_id = ?
         AND accepted_at IS NOT NULL
         AND group_id IS NOT NULL`,
    )
    .bind(memberUserId)
    .all<{ owner_user_id: string; group_id: string }>();
  return (rows.results ?? []).map((r) => ({
    ownerUserId: r.owner_user_id,
    groupId: r.group_id,
  }));
}

// ---------------------------------------------------------------------------
// Phase 2 — HTTP handlers
// ---------------------------------------------------------------------------

export interface TeamsEnv {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  CLERK_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  /** Origin used in the invite-link URL. Production: https://chefflow.uk.
   *  Tests inject a fixture host. */
  appBaseUrl?: string;
  /** Injectable fetch for tests (Clerk API + Resend API calls). */
  fetchImpl?: FetchLike;
}

const DEFAULT_APP_BASE_URL = 'https://chefflow.uk';

interface ClerkUserShape {
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string;
  public_metadata?: { tier?: unknown };
}

/** Fetch a single Clerk user's primary email address. Used at invite
 *  time (to greet the recipient with the inviter's email) and at accept
 *  time (to verify the accepting JWT's email matches the invite — a
 *  forwarded invite email can't be claimed by an attacker's account). */
export async function fetchUserEmail(
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as ClerkUserShape;
    const primary = user.email_addresses?.find(
      (e) => e.id === user.primary_email_address_id,
    );
    return primary?.email_address?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * POST /api/teams/invite — owner-only. Body { email }. Insert pending
 * row + send invite email. Rejects non-Enterprise tiers (seat cap = 1
 * means free/pro can't invite anyone, business gets 5). Returns
 * { token, email } on success — caller can paste the accept-link if
 * Resend is offline.
 */
export async function handleInvite(
  req: Request,
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const body = await readJson(req);
  const email = (body as { email?: unknown })?.email;
  if (typeof email !== 'string' || !isValidEmail(email)) {
    return jsonResponse({ error: 'Body must include a valid email' }, 400);
  }
  const memberEmail = email.trim().toLowerCase();

  const tier = await fetchUserTier(ownerUserId, env.CLERK_SECRET_KEY, env.RATE_LIMIT, env.fetchImpl);
  try {
    await assertCanInvite(env.DB, ownerUserId, tier);
  } catch (err) {
    if (err instanceof TeamSeatCapReached) {
      return jsonResponse(
        { error: err.message, tier: err.tier, current: err.current, limit: err.limit },
        409,
      );
    }
    throw err;
  }

  // T5: groupId is REQUIRED. Pre-T5 we lazy-created a Default group
  // and used it as a fallback; T5 makes team creation explicit (chef
  // creates a team from /teams, then invites into it), so a missing
  // groupId is a 400. The /teams/:id page always sends one.
  const requestedGroupId = (body as { groupId?: unknown })?.groupId;
  if (typeof requestedGroupId !== 'string' || requestedGroupId.length === 0) {
    return jsonResponse({ error: 'Body must include a groupId (invite into a specific team)' }, 400);
  }
  const groupId = requestedGroupId;

  // Idempotency: if the same (owner, email) already exists pending,
  // re-send the email with the SAME token rather than insert a duplicate
  // (which would fail the PK constraint anyway). Accepted rows are
  // surfaced as 409 — the chef should remove + re-invite if rotating.
  const existing = await env.DB
    .prepare('SELECT invite_token, accepted_at FROM team_memberships WHERE owner_user_id = ? AND member_email = ?')
    .bind(ownerUserId, memberEmail)
    .first<{ invite_token: string; accepted_at: number | null }>();

  let inviteToken: string;
  if (existing) {
    if (existing.accepted_at) {
      return jsonResponse({ error: 'This email is already an accepted member' }, 409);
    }
    inviteToken = existing.invite_token;
  } else {
    inviteToken = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO team_memberships
         (owner_user_id, member_email, role, invite_token, invited_at, group_id)
         VALUES (?, ?, 'viewer', ?, ?, ?)`,
      )
      .bind(ownerUserId, memberEmail, inviteToken, Date.now(), groupId)
      .run();
  }

  // Fire-and-log the invite email. We DO NOT roll back the DB row on
  // email failure — the chef can re-send via re-invite (idempotent
  // above), and we return the token in the response so they can copy
  // the accept-link manually as a fallback (also useful for local dev
  // where Resend isn't configured).
  const ownerEmail = await fetchUserEmail(ownerUserId, env.CLERK_SECRET_KEY, env.fetchImpl);
  const appBaseUrl = env.appBaseUrl ?? DEFAULT_APP_BASE_URL;
  const acceptUrl = `${appBaseUrl}/teams/accept?token=${encodeURIComponent(inviteToken)}`;
  let emailStatus: 'sent' | 'skipped-no-key' | 'failed' = 'skipped-no-key';
  if (env.RESEND_API_KEY) {
    try {
      await sendContactNotification({
        apiKey: env.RESEND_API_KEY,
        name: 'ChefFlow Teams',
        email: ownerEmail ?? 'noreply@chefflow.uk',
        message: '',
        toAddress: memberEmail,
        fromAddress: 'ChefFlow Teams <noreply@chefflow.uk>',
        subjectOverride: `You've been invited to a ChefFlow team`,
        htmlBodyOverride: buildInviteHtml(ownerEmail, acceptUrl),
        textBodyOverride: buildInviteText(ownerEmail, acceptUrl),
        fetchImpl: env.fetchImpl as typeof fetch | undefined,
      });
      emailStatus = 'sent';
    } catch (err) {
      console.warn('[teams] invite email failed:', err instanceof Error ? err.message : String(err));
      emailStatus = 'failed';
    }
  }

  return jsonResponse(
    { email: memberEmail, token: inviteToken, acceptUrl, emailStatus },
    200,
  );
}

function buildInviteHtml(ownerEmail: string | null, acceptUrl: string): string {
  const inviter = ownerEmail ? `<strong>${ownerEmail}</strong>` : 'A ChefFlow chef';
  return `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;color:#1f2937;">
<h2 style="margin:0 0 12px 0;">You're invited to a ChefFlow team</h2>
<p>${inviter} has invited you to join their ChefFlow kitchen. You'll be able to view their recipes, events, and workflows. You won't be able to edit or share them — only the head chef can do that.</p>
<p><a href="${acceptUrl}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#f97316;color:#fff;text-decoration:none;font-weight:600;">Accept invitation</a></p>
<p style="font-size:12px;color:#6b7280;">If the button doesn't work, paste this URL into your browser:<br>${acceptUrl}</p>
</body></html>`;
}

function buildInviteText(ownerEmail: string | null, acceptUrl: string): string {
  const inviter = ownerEmail ?? 'A ChefFlow chef';
  return [
    `You're invited to a ChefFlow team`,
    ``,
    `${inviter} has invited you to join their ChefFlow kitchen.`,
    `You'll be able to view their recipes, events, and workflows.`,
    `You won't be able to edit or share them — only the head chef can do that.`,
    ``,
    `Accept the invitation here:`,
    acceptUrl,
  ].join('\n');
}

/**
 * POST /api/teams/accept — member-only. Body { token }. Looks up the
 * invite, verifies the JWT's email matches the invite's member_email
 * (prevents a forwarded invite email being claimed by an attacker
 * account), and stamps member_user_id + accepted_at.
 */
export async function handleAccept(
  req: Request,
  env: TeamsEnv,
  memberUserId: string,
): Promise<Response> {
  const body = await readJson(req);
  const token = (body as { token?: unknown })?.token;
  if (typeof token !== 'string' || token.length < 8) {
    return jsonResponse({ error: 'Body must include a valid token' }, 400);
  }
  const invite = await env.DB
    .prepare(
      `SELECT owner_user_id, member_email, member_user_id, accepted_at
       FROM team_memberships WHERE invite_token = ?`,
    )
    .bind(token)
    .first<{
      owner_user_id: string;
      member_email: string;
      member_user_id: string | null;
      accepted_at: number | null;
    }>();
  if (!invite) {
    return jsonResponse({ error: 'Invite not found or already revoked' }, 404);
  }
  if (invite.accepted_at && invite.member_user_id && invite.member_user_id !== memberUserId) {
    return jsonResponse({ error: 'This invite was already accepted by a different account' }, 409);
  }
  const memberEmail = await fetchUserEmail(memberUserId, env.CLERK_SECRET_KEY, env.fetchImpl);
  if (!memberEmail || memberEmail !== invite.member_email) {
    return jsonResponse(
      { error: `Sign in as ${invite.member_email} to accept this invite` },
      403,
    );
  }
  await env.DB
    .prepare(
      `UPDATE team_memberships
       SET member_user_id = ?, accepted_at = ?
       WHERE invite_token = ?`,
    )
    .bind(memberUserId, Date.now(), token)
    .run();
  return jsonResponse({ ownerUserId: invite.owner_user_id, memberEmail: invite.member_email }, 200);
}

/** GET /api/teams/list — owner-only. Returns pending + accepted
 *  members with their group_id. T5: no auto-default; an empty list
 *  is fine and means the chef hasn't created any teams yet. */
export async function handleList(
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const rows = await env.DB
    .prepare(
      `SELECT member_email, member_user_id, role, invited_at, accepted_at, group_id
       FROM team_memberships WHERE owner_user_id = ?
       ORDER BY invited_at DESC`,
    )
    .bind(ownerUserId)
    .all<{
      member_email: string;
      member_user_id: string | null;
      role: TeamRole;
      invited_at: number;
      accepted_at: number | null;
      group_id: string | null;
    }>();
  return jsonResponse({ members: rows.results ?? [] }, 200);
}

/** DELETE /api/teams/:email — owner-only. Removes the membership row.
 *  Used to revoke pending invites OR remove accepted members. */
export async function handleDelete(
  email: string,
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const memberEmail = email.trim().toLowerCase();
  if (!isValidEmail(memberEmail)) {
    return jsonResponse({ error: 'Invalid email in path' }, 400);
  }
  const result = await env.DB
    .prepare('DELETE FROM team_memberships WHERE owner_user_id = ? AND member_email = ?')
    .bind(ownerUserId, memberEmail)
    .run();
  const changes = (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
  if (changes === 0) {
    return jsonResponse({ error: 'Member not found' }, 404);
  }
  return jsonResponse({ removed: memberEmail }, 200);
}

/** Internal helper: list owner user IDs the given member has accepted
 *  into. Shared by handleOwnersOfMe (HTTP) and the sync.pull route
 *  (Phase 3 — read-only fan-in of owner content for member sync). */
export async function getAcceptedOwnersForMember(
  db: D1Database,
  memberUserId: string,
): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT owner_user_id FROM team_memberships
       WHERE member_user_id = ? AND accepted_at IS NOT NULL`,
    )
    .bind(memberUserId)
    .all<{ owner_user_id: string }>();
  return (rows.results ?? []).map((r) => r.owner_user_id);
}

/**
 * GET /api/teams/owners-of-me — member-only. Returns the list of owner
 * user IDs whose teams the caller has accepted into. Used by Phase 3
 * to gate which owners' content the sync-pull returns to this member.
 */
export async function handleOwnersOfMe(
  env: TeamsEnv,
  memberUserId: string,
): Promise<Response> {
  const owners = await getAcceptedOwnersForMember(env.DB, memberUserId);
  return jsonResponse({ owners }, 200);
}

// ---------------------------------------------------------------------------
// T4 Phase 2 — Groups CRUD handlers
// ---------------------------------------------------------------------------

const MAX_GROUP_NAME_LEN = 50;

function isValidGroupName(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0 && s.trim().length <= MAX_GROUP_NAME_LEN;
}

/** GET /api/teams/groups — owner-only. Returns the owner's groups
 *  in createdAt asc. T5: no lazy default; an empty list is the
 *  expected state until the chef creates their first team from /teams. */
export async function handleListGroups(
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const rows = await env.DB
    .prepare(
      `SELECT id, name, is_default, created_at
       FROM groups WHERE owner_user_id = ?
       ORDER BY is_default DESC, created_at ASC`,
    )
    .bind(ownerUserId)
    .all<{ id: string; name: string; is_default: number; created_at: number }>();
  const groups = (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.is_default === 1,
    createdAt: r.created_at,
  }));
  return jsonResponse({ groups }, 200);
}

/** POST /api/teams/groups — owner-only. Body { name }. Creates a new
 *  group; rejects duplicate name (case-insensitive) for the owner. */
export async function handleCreateGroup(
  req: Request,
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const body = await readJson(req);
  const rawName = (body as { name?: unknown })?.name;
  if (!isValidGroupName(rawName)) {
    return jsonResponse({ error: 'Body must include a name (1-50 chars)' }, 400);
  }
  const name = rawName.trim();

  // T5: no auto-default group, so no "Default" name collision to guard
  // against here — chef can name their first team "Default" if they want.
  const existing = await env.DB
    .prepare(
      `SELECT id FROM groups
       WHERE owner_user_id = ? AND lower(name) = lower(?)`,
    )
    .bind(ownerUserId, name)
    .first<{ id: string }>();
  if (existing) {
    return jsonResponse({ error: 'A group with that name already exists' }, 409);
  }

  const id = `grp_${crypto.randomUUID()}`;
  await env.DB
    .prepare(
      `INSERT INTO groups (id, owner_user_id, name, is_default, created_at)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .bind(id, ownerUserId, name, Date.now())
    .run();
  return jsonResponse({ id, name, isDefault: false }, 200);
}

/** PATCH /api/teams/groups/:id — owner-only. Body { name }. Renames a
 *  group the caller owns; refuses to rename the Default group (the name
 *  is the user-visible anchor for the "everything I own goes here by
 *  default" guarantee). */
export async function handleRenameGroup(
  req: Request,
  groupId: string,
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const body = await readJson(req);
  const rawName = (body as { name?: unknown })?.name;
  if (!isValidGroupName(rawName)) {
    return jsonResponse({ error: 'Body must include a name (1-50 chars)' }, 400);
  }
  const name = rawName.trim();
  const existing = await env.DB
    .prepare(
      `SELECT is_default FROM groups WHERE owner_user_id = ? AND id = ?`,
    )
    .bind(ownerUserId, groupId)
    .first<{ is_default: number }>();
  if (!existing) {
    return jsonResponse({ error: 'Group not found' }, 404);
  }
  if (existing.is_default === 1) {
    return jsonResponse({ error: 'The Default group cannot be renamed' }, 409);
  }
  // Reject duplicate name (case-insensitive), excluding self.
  const dup = await env.DB
    .prepare(
      `SELECT id FROM groups
       WHERE owner_user_id = ? AND lower(name) = lower(?) AND id != ?`,
    )
    .bind(ownerUserId, name, groupId)
    .first<{ id: string }>();
  if (dup) {
    return jsonResponse({ error: 'A group with that name already exists' }, 409);
  }
  await env.DB
    .prepare(`UPDATE groups SET name = ? WHERE owner_user_id = ? AND id = ?`)
    .bind(name, ownerUserId, groupId)
    .run();
  return jsonResponse({ id: groupId, name }, 200);
}

/** DELETE /api/teams/groups/:id — owner-only. Deletes a team and its
 *  memberships outright (T5: no Default group exists to fall back to,
 *  so deletion is final — members lose access; chef can re-invite
 *  under a different team they create). Stale group_ids inside
 *  recipe/event/menu payload.sharedWithGroupIds are NOT scrubbed
 *  eagerly — they're harmless (no member can match a deleted group),
 *  and the next time the chef edits the item the chip row won't show
 *  the deleted group so they'll save without it. */
export async function handleDeleteGroup(
  groupId: string,
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const target = await env.DB
    .prepare(
      `SELECT is_default FROM groups WHERE owner_user_id = ? AND id = ?`,
    )
    .bind(ownerUserId, groupId)
    .first<{ is_default: number }>();
  if (!target) {
    return jsonResponse({ error: 'Group not found' }, 404);
  }
  if (target.is_default === 1) {
    return jsonResponse({ error: 'The Default group cannot be deleted' }, 409);
  }
  // Drop memberships first so we don't leave orphans pointing at a
  // group_id that no longer exists.
  await env.DB
    .prepare(
      `DELETE FROM team_memberships
       WHERE owner_user_id = ? AND group_id = ?`,
    )
    .bind(ownerUserId, groupId)
    .run();
  await env.DB
    .prepare(`DELETE FROM groups WHERE owner_user_id = ? AND id = ?`)
    .bind(ownerUserId, groupId)
    .run();
  return jsonResponse({ removed: groupId }, 200);
}
