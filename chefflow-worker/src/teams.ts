// Enterprise team-membership module — Phases 1 + 2 of T3c.
//
// Phase 1: data shape + seat-cap helper (assertCanInvite).
// Phase 2: HTTP handlers for invite / accept / list / delete /
// owners-of-me. Phase 3 (next) will plug owners-of-me into the
// sync-layer pull so members see the owner's recipes/events/workflows
// as read-only rows.
//
// One row per (owner_user_id, member_email). While pending,
// member_user_id + accepted_at are NULL. The invite_token is what the
// accept-link in the email carries.

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
         (owner_user_id, member_email, role, invite_token, invited_at)
         VALUES (?, ?, 'viewer', ?, ?)`,
      )
      .bind(ownerUserId, memberEmail, inviteToken, Date.now())
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

/** GET /api/teams/list — owner-only. Returns pending + accepted members. */
export async function handleList(
  env: TeamsEnv,
  ownerUserId: string,
): Promise<Response> {
  const rows = await env.DB
    .prepare(
      `SELECT member_email, member_user_id, role, invited_at, accepted_at
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
