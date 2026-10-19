-- =========================================================================
-- Migration 006: projects.current_focus_pbi_id
-- US-07 (SCRUM-198) - Current Focus Highlight
-- =========================================================================
-- Hand-written, run manually. This project has no migration framework (see
-- server/db/README.md).
--
-- Only needed for a database created BEFORE this change. A fresh database
-- set up from schema.sql already has this column - see the
-- "projects.current_focus_pbi_id" block in schema.sql, which this file
-- mirrors exactly.
--
-- Run once, against the same database, after its existing schema:
--   psql "<connection string>" -f server/db/migrations/006_us07_current_focus.sql
--
-- What it does:
--   Adds one nullable column, projects.current_focus_pbi_id, a foreign key to
--   product_backlog_items(id) with ON DELETE SET NULL, plus an index on it.
--   NULL means the project has no current focus. Deleting the focused PBI
--   clears the focus instead of blocking the delete. Every existing project
--   starts with NULL (no focus).
--
-- The foreign key only checks that the PBI exists. That the PBI belongs to
-- the same project is checked by setCurrentFocus (projectModel.js).
--
-- Safe to run more than once: ADD COLUMN IF NOT EXISTS skips the column (and
-- its inline foreign key) when it is already there, and CREATE INDEX IF NOT
-- EXISTS does the same for the index. No data is changed or removed.
-- =========================================================================

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS current_focus_pbi_id bigint
        REFERENCES product_backlog_items (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_current_focus_pbi_id
    ON projects (current_focus_pbi_id);

COMMIT;
