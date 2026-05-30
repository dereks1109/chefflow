-- Team groups (T4 Phase 1). Lets an Enterprise owner partition members
-- into named groups (e.g. Morning shift, Evening shift, Pop-up team)
-- and tick which recipes / events / menus each group can see.
--
-- Migration model:
--   - One row per (owner_user_id, group_id). is_default=1 marks the
--     auto-created "Default" group that every owner gets lazily on
--     their first /api/teams/list or /api/sync/pull call after deploy.
--   - team_memberships.group_id is ADDED here as NULLABLE. ensureDefault
--     Group() backfills any null rows to the owner's Default the next
--     time it runs (idempotent, KV-gated).
--   - Recipe / Event / Menu rows live in the existing sync tables; the
--     "shared with which groups" relationship is encoded inside their
--     JSON payload as sharedWithGroupIds: string[]. We filter in JS at
--     pull time (small data, MVP).
--
-- Why ADD COLUMN instead of a new memberships_v2 table: the existing
-- (owner_user_id, member_email) primary key still uniquely identifies
-- a membership; the group_id is a new attribute, not a new identity.

CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,           -- "grp_<uuid>"
  owner_user_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0, -- 1 for the auto-created Default per owner
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS groups_by_owner ON groups(owner_user_id);

ALTER TABLE team_memberships ADD COLUMN group_id TEXT;

CREATE INDEX IF NOT EXISTS team_memberships_by_group
  ON team_memberships(group_id);
