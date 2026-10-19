-- =========================================================================
-- Migration 007: sprints.scrum_master_id, sprints.product_owner_identifier
-- US-09 (SCRUM-176) - Tag Scrum Master & Product Owner
-- =========================================================================
-- Hand-written, run manually. This project has no migration framework (see
-- server/db/README.md).
--
-- Only needed for a database created BEFORE this change. A fresh database
-- set up from schema.sql already has these columns - see the "sprints Scrum
-- roles" block in schema.sql, which this file mirrors exactly.
--
-- Run once, against the same database, after its existing schema:
--   psql "<connection string>" -f server/db/migrations/007_us09_scrum_roles.sql
--
-- What it does:
--   scrum_master_id           nullable FK to users(id), ON DELETE SET NULL,
--                             so deleting the user clears the tag instead
--                             of blocking the delete. Indexed.
--   product_owner_identifier  nullable varchar(255): an email or a name,
--                             as free text, until the client confirms how
--                             the Product Owner is identified. Not linked
--                             to users yet.
--
-- The roles live on the sprint, so starting a sprint (which only changes
-- status and started_at) keeps them. Every existing sprint starts with NULL
-- (nobody tagged).
--
-- Safe to run more than once: ADD COLUMN IF NOT EXISTS and CREATE INDEX IF
-- NOT EXISTS skip anything already there. No data is changed or removed.
-- =========================================================================

BEGIN;

ALTER TABLE sprints
    ADD COLUMN IF NOT EXISTS scrum_master_id bigint
        REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE sprints
    ADD COLUMN IF NOT EXISTS product_owner_identifier varchar(255);

CREATE INDEX IF NOT EXISTS idx_sprints_scrum_master_id
    ON sprints (scrum_master_id);

COMMIT;
