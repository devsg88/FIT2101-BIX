-- =========================================================================
-- Migration 001: task/sub-task assignee + status vocabulary
-- US-04a (SCRUM-121)
-- =========================================================================
-- Hand-written, run manually. This project has no migration framework (see
-- server/db/README.md) - do NOT fold this into schema.sql; re-running
-- schema.sql will not apply changes to a table that already exists.
--
-- Run once, after schema.sql/seed.sql, against the same database:
--   psql "<connection string>" -f server/db/migrations/001_task_subtask_assignee_and_status.sql
--
-- Two assumptions are being made here, stated per the US-04a implementation
-- prompt rather than agreed with the team - flag both for review:
--
--   1. assignee_id (tasks and sub_tasks): nullable, ONE assignee per task /
--      sub-task, ON DELETE SET NULL (removing a user un-assigns their work
--      rather than blocking the delete, matching the "protect real work
--      data, not membership/assignment links" reasoning already used for
--      team_members/project_members in schema.sql). Deliberately a separate
--      column from US-11's plural "collaborators" field - different concept,
--      not to be merged.
--
--   2. status vocabulary (tasks and sub_tasks): 'todo' / 'in_progress' /
--      'done', NOT NULL, default 'todo'. This is exactly the placeholder
--      vocabulary seed.sql already uses, promoted to an enforced CHECK.
--      Resolves "Open questions and flags" #1 in server/db/README.md.
--      Existing NULL rows are backfilled to 'todo' before NOT NULL is
--      applied, so this is safe to run against a database that already has
--      tasks/sub_tasks rows with no status set.
--
-- Safe to run more than once: every step checks whether it already applied
-- before making a change (ADD COLUMN IF NOT EXISTS, and a pg_constraint
-- existence check before each ADD CONSTRAINT, since PostgreSQL has no
-- ADD CONSTRAINT IF NOT EXISTS syntax).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- tasks.assignee_id
-- -------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assignee_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_assignee_id_fkey
      FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks (assignee_id);

-- -------------------------------------------------------------------------
-- sub_tasks.assignee_id
-- -------------------------------------------------------------------------
ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS assignee_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sub_tasks_assignee_id_fkey'
  ) THEN
    ALTER TABLE sub_tasks
      ADD CONSTRAINT sub_tasks_assignee_id_fkey
      FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sub_tasks_assignee_id ON sub_tasks (assignee_id);

-- -------------------------------------------------------------------------
-- tasks.status: backfill NULLs, then enforce NOT NULL + default + CHECK
-- -------------------------------------------------------------------------
UPDATE tasks SET status = 'todo' WHERE status IS NULL;

ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'todo';
ALTER TABLE tasks ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_chk'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_status_chk
      CHECK (status IN ('todo', 'in_progress', 'done'));
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- sub_tasks.status: same treatment
-- -------------------------------------------------------------------------
UPDATE sub_tasks SET status = 'todo' WHERE status IS NULL;

ALTER TABLE sub_tasks ALTER COLUMN status SET DEFAULT 'todo';
ALTER TABLE sub_tasks ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sub_tasks_status_chk'
  ) THEN
    ALTER TABLE sub_tasks
      ADD CONSTRAINT sub_tasks_status_chk
      CHECK (status IN ('todo', 'in_progress', 'done'));
  END IF;
END $$;

COMMIT;
