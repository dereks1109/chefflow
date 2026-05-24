-- ChefFlow sync schema. Per-user records keyed by (owner_id, id). The
-- payload column holds the full Recipe/KitchenEvent JSON — the worker
-- doesn't query nested fields, so a single TEXT column is enough.
--
-- server_version is the authoritative ordering used by the pull endpoint
-- (clients keep the max they've seen and ask for "since > max"). It's set
-- to the wall-clock time of each write — collisions across rows are fine
-- because the query only filters per-owner.

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at INTEGER,
  payload TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX IF NOT EXISTS recipes_owner_version ON recipes(owner_id, server_version);

CREATE TABLE IF NOT EXISTS events (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at INTEGER,
  payload TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX IF NOT EXISTS events_owner_version ON events(owner_id, server_version);
