-- Enterprise team-membership table. Powers the "head chef invites
-- view-only members" feature (T3c Phase 1). Each row links a member
-- email — and, once accepted, a Clerk userId — to an Enterprise
-- owner's team.
--
-- One row per (owner, member_email) pair. While the invite is pending,
-- member_user_id + accepted_at are NULL. The invite_token is what the
-- accept-link in the email carries; we look up the row by token at
-- accept time and stamp the member_user_id + accepted_at.
--
-- Roles: only 'viewer' is supported today. Future tiers (editor,
-- admin) would land here. The CHECK constraint keeps junk roles out.
--
-- Seat enforcement (TIER_LIMITS.enterprise.maxSeats = 50) is applied at
-- the invite endpoint via assertCanInvite() in src/teams.ts, not at
-- the DB layer — D1 doesn't have per-row count triggers, and a
-- pre-insert COUNT is simpler than a trigger anyway.

CREATE TABLE IF NOT EXISTS team_memberships (
  owner_user_id  TEXT    NOT NULL,
  member_email   TEXT    NOT NULL,
  member_user_id TEXT,
  role           TEXT    NOT NULL CHECK (role IN ('viewer')),
  invite_token   TEXT    NOT NULL,
  invited_at     INTEGER NOT NULL,
  accepted_at    INTEGER,
  PRIMARY KEY (owner_user_id, member_email)
);

-- Phase 3 will query this index every sync pull to find which owners'
-- content the caller (a member) is entitled to see.
CREATE INDEX IF NOT EXISTS team_memberships_by_member
  ON team_memberships(member_user_id);

-- Phase 2's POST /api/teams/accept looks up rows by invite_token.
CREATE INDEX IF NOT EXISTS team_memberships_by_token
  ON team_memberships(invite_token);
