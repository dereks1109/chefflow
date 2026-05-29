// Enterprise team-membership module — Phase 1 of T3c.
//
// Scope (Phase 1): data shape + seat-cap helper. The HTTP handlers
// (invite / accept / list / delete) ship in Phase 2 on top of this
// module. The sync-layer plumbing that returns owner content to
// members ships in Phase 3.
//
// One row per (owner_user_id, member_email). While pending,
// member_user_id + accepted_at are NULL. The invite_token is what the
// accept-link in the email carries.

import { TIER_LIMITS, type Tier } from '../../chefflow/src/core/tier/limits';

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
