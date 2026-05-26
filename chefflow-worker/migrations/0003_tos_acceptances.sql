-- ToS / Disclaimer acceptance audit log. Written every time a chef ticks
-- the onboarding-sheet acceptance checkbox. Clerk's publicMetadata also
-- carries `tosAcceptedAt` + `tosVersion` (so the SPA can gate behaviour
-- per-session without a worker call), but Clerk is a third party — this
-- table is our own redundant record we control and can produce in a
-- legal-defence context.
--
-- Multiple rows per user are allowed: each ToS-version bump triggers a
-- re-acceptance flow, and we keep every prior acceptance for the audit
-- trail. Query the latest row per user by ORDER BY accepted_at DESC.

CREATE TABLE IF NOT EXISTS tos_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  tos_version TEXT NOT NULL,
  disclaimer_version TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS tos_acceptances_user
  ON tos_acceptances(user_id, accepted_at DESC);
