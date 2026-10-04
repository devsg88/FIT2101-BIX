-- US-11 (Yichi Zhang) — SCRUM-127
-- Add actual effort + assignee on tasks, and PBI collaborator records.
-- Safe to re-run. Run after schema.sql (needs users + product_backlog_items).

BEGIN;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS actual_hours numeric(6,2);

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS assignee_id bigint REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_actual_hours_positive_chk;
ALTER TABLE tasks
    ADD CONSTRAINT tasks_actual_hours_positive_chk
    CHECK (actual_hours IS NULL OR actual_hours > 0);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks (assignee_id);

CREATE TABLE IF NOT EXISTS pbi_collaborators (
    pbi_id  bigint NOT NULL REFERENCES product_backlog_items (id) ON DELETE RESTRICT,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    PRIMARY KEY (pbi_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pbi_collaborators_user_id ON pbi_collaborators (user_id);

COMMIT;
