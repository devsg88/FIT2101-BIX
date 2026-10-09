-- =========================================================================
-- Migration 005: product_backlog_items.completed_at
-- US-15 (SCRUM-153) - Sprint Burndown Chart
-- =========================================================================
-- Hand-written, run manually. This project has no migration framework (see
-- server/db/README.md).
--
-- Run once, against the same database, after its existing schema:
--   psql "<connection string>" -f server/db/migrations/005_us15_pbi_completed_at.sql
--
-- Why: the burndown removes a Story's points from the day it was completed.
-- Until now the only timestamp on a PBI was updated_at, which every edit
-- bumps. completePbi (completionModel.js, US-11) now sets completed_at when a
-- PBI moves to Completed.
--
-- Existing completed PBIs are backfilled from updated_at, the closest value
-- available. Rows that are not completed stay NULL.
--
-- Safe to run more than once: ADD COLUMN IF NOT EXISTS skips the column when
-- it is already there, and the backfill only touches rows still NULL.
-- =========================================================================

BEGIN;

ALTER TABLE product_backlog_items
    ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE product_backlog_items
   SET completed_at = updated_at
 WHERE stage = 'completed' AND completed_at IS NULL;

COMMIT;
