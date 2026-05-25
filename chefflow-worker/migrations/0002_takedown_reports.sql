-- Notice-and-takedown queue for the community library. Anyone (signed-in
-- user OR rights-holder via a separate signed-in account ChefFlow staff
-- creates) can file a report; admin reviews + actions via the dashboard.
--
-- Status lifecycle:
--   pending   -> a report has been filed, no action yet
--   resolved  -> admin unpublished the recipe (or otherwise actioned)
--   dismissed -> admin reviewed and decided no action needed
--
-- We do NOT cascade-delete reports when the recipe is unpublished — they
-- stay in the table for audit / legal record.

CREATE TABLE IF NOT EXISTS takedown_reports (
  id TEXT PRIMARY KEY,
  community_recipe_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reporter_email TEXT,
  reason_code TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reported_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by_user_id TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS takedown_reports_status
  ON takedown_reports(status, reported_at DESC);

CREATE INDEX IF NOT EXISTS takedown_reports_recipe
  ON takedown_reports(community_recipe_id);
