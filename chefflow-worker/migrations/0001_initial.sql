-- ChefFlow per-user sync schema. One table per Dexie store.
-- All rows are scoped by `user_id` (Clerk subject); PK is (user_id, id) so the
-- storage layer can't even SELECT another user's data without a user_id match.
-- Last-Write-Wins is driven by `updated_at` (epoch ms). Soft deletes via
-- `is_deleted = 1` so deletions propagate across devices without the row
-- coming back via a stale push.
-- `payload` holds the JSON-serialised full row (Recipe / KitchenEvent / Menu /
-- AllergenAuditEntry). Keeps the schema flexible — we don't have to track
-- every nested field as a column. Trade-off: no SQL queries on inner fields,
-- but the only server-side query at v1 is `WHERE user_id = ? AND updated_at > ?`.

CREATE TABLE recipes (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  payload     TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_recipes_user_updated ON recipes(user_id, updated_at);

CREATE TABLE events (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  payload     TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_events_user_updated ON events(user_id, updated_at);

CREATE TABLE menus (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  payload     TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_menus_user_updated ON menus(user_id, updated_at);

CREATE TABLE allergen_audits (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  payload     TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_allergen_audits_user_updated ON allergen_audits(user_id, updated_at);
