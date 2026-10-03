-- =========================================================================
-- Migration 003: projects.responsible_admin_id
-- US-04d (SCRUM-19) - Admin Project Creation & Ownership
-- =========================================================================
-- Hand-written, run manually. This project has no migration framework (see
-- server/db/README.md).
--
-- Only needed for a database created BEFORE this change. A fresh database
-- set up from schema.sql already has this column - see the
-- "projects.responsible_admin_id" block in schema.sql, which this file
-- mirrors exactly.
--
-- Run once, against the same database, after its existing schema:
--   psql "<connection string>" -f server/db/migrations/003_us04d_project_responsible_admin.sql
--
-- What it does:
--   Adds one nullable column, projects.responsible_admin_id, a foreign key to
--   users(id) with ON DELETE RESTRICT, plus an index on it. It does not
--   assign an owner to any existing project: which Admin is responsible for
--   which existing project is not something a migration can know, so every
--   existing project starts with NULL (no Admin responsible). The seeded demo
--   ownership lives in seed.sql - re-run seed.sql afterwards if you want it.
--
-- Safe to run more than once: ADD COLUMN IF NOT EXISTS skips the column (and
-- its inline foreign key) when it is already there, and CREATE INDEX IF NOT
-- EXISTS does the same for the index. No data is changed or removed.
-- =========================================================================

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS responsible_admin_id bigint
        REFERENCES users (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_projects_responsible_admin_id
    ON projects (responsible_admin_id);

COMMIT;
