-- User-scoped preferences (unit system, etc.) — one row per user. Same
-- column layout and (owner_id, id) primary key as recipes/events so the
-- shared upsertRow handler in sync.ts works without a special case.
-- Convention: client sets id == owner_id, collapsing the composite key to
-- a natural single-row-per-user.

CREATE TABLE IF NOT EXISTS user_prefs (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at INTEGER,
  payload TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX IF NOT EXISTS user_prefs_owner_version ON user_prefs(owner_id, server_version);
