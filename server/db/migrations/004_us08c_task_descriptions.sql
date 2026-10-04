-- Safe to re-run against an existing database; fresh installs use schema.sql.
BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS description text;

COMMIT;
