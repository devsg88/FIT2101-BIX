-- =========================================================================
-- BIX - sample data for local development
-- =========================================================================
-- Run AFTER schema.sql, against the same database.
--
-- Re-run safety: every INSERT uses ON CONFLICT (id) DO NOTHING, so rows that
-- already exist are left untouched (they are NOT updated to match this file).
-- This script contains no DELETE or TRUNCATE. To reload from scratch you must
-- remove the rows yourself first - see server/db/README.md.
-- The one UPDATE (project responsibility, after the users insert) only fills
-- responsible_admin_id where it is still NULL, so it never overwrites an
-- owner that has already been set.
--
-- Explicit ids are used so the foreign keys are easy to read. The identity
-- sequences are re-synced at the end so future auto-generated ids continue
-- after the highest id inserted here.
--
-- FLAG: the task / sub_task status values below ('todo', 'in_progress',
-- 'done') are placeholders. The real vocabulary is a pending team decision
-- (see server/db/README.md). The schema does not constrain these values yet,
-- so any string will load.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- projects
-- -------------------------------------------------------------------------
INSERT INTO projects (id, name) VALUES
    (1, 'BIX Platform'),
    (2, 'Mobile App')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- sprints  (one completed, one active, one in planning for project 1;
--           one in planning for project 2)
-- -------------------------------------------------------------------------
INSERT INTO sprints (id, project_id, name, status, started_at, created_at) VALUES
    (1, 1, 'Sprint 1', 'completed', TIMESTAMPTZ '2026-08-03 09:00+00', TIMESTAMPTZ '2026-07-30 09:00+00'),
    (2, 1, 'Sprint 2', 'active',    TIMESTAMPTZ '2026-08-17 09:00+00', TIMESTAMPTZ '2026-08-14 09:00+00'),
    (3, 1, 'Sprint 3', 'planning',  NULL,                              TIMESTAMPTZ '2026-08-31 09:00+00'),
    (4, 2, 'Sprint 1', 'planning',  NULL,                              TIMESTAMPTZ '2026-09-01 09:00+00')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- product_backlog_items
--   PBI 1 and PBI 5 have no sprint (still in the Product Backlog).
--   PBI 2 / 6 are in Sprint Planning, PBI 3 is in the Active Sprint,
--   PBI 4 is Completed and carries both estimated and actual hours.
-- -------------------------------------------------------------------------
INSERT INTO product_backlog_items
    (id, project_id, sprint_id, title, description, stage,
     planned_start_date, planned_end_date, estimated_hours, actual_hours,
     created_at, updated_at) VALUES
    (1, 1, NULL, 'User can reset password',
     'Allow a user to request a reset link and set a new password.',
     'product_backlog', NULL, NULL, NULL, NULL,
     TIMESTAMPTZ '2026-08-20 10:00+00', TIMESTAMPTZ '2026-08-20 10:00+00'),

    (2, 1, 3, 'User can upload a profile photo',
     'Profile page gains an avatar upload with size and type validation.',
     'sprint_planning', DATE '2026-09-15', DATE '2026-09-22', 16.00, NULL,
     TIMESTAMPTZ '2026-08-21 10:00+00', TIMESTAMPTZ '2026-09-02 14:30+00'),

    (3, 1, 2, 'Dashboard shows sprint burndown',
     'Burndown chart of remaining estimated hours across the sprint.',
     'active_sprint', DATE '2026-08-17', DATE '2026-08-28', 24.00, NULL,
     TIMESTAMPTZ '2026-08-10 10:00+00', TIMESTAMPTZ '2026-08-17 09:05+00'),

    (4, 1, 1, 'Login page',
     'Email and password login form wired to the auth API.',
     'completed', DATE '2026-08-03', DATE '2026-08-07', 8.00, 10.50,
     TIMESTAMPTZ '2026-07-28 10:00+00', TIMESTAMPTZ '2026-08-07 16:00+00'),

    (5, 2, NULL, 'App onboarding flow',
     'First-run screens introducing the core features.',
     'product_backlog', NULL, NULL, NULL, NULL,
     TIMESTAMPTZ '2026-09-01 10:00+00', TIMESTAMPTZ '2026-09-01 10:00+00'),

    (6, 2, 4, 'Push notifications',
     'Opt-in push notifications for task assignments and mentions.',
     'sprint_planning', DATE '2026-09-16', DATE '2026-09-23', 12.00, NULL,
     TIMESTAMPTZ '2026-09-02 10:00+00', TIMESTAMPTZ '2026-09-05 11:00+00')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- tasks  (PBIs 1, 5 and 6 intentionally have none)
-- -------------------------------------------------------------------------
INSERT INTO tasks (id, pbi_id, title, status) VALUES
    (1, 2, 'Build the upload API endpoint',          'todo'),
    (2, 2, 'Add the upload control to profile page', 'todo'),
    (3, 3, 'Aggregate remaining hours per day',      'in_progress'),
    (4, 4, 'Build the login form',                   'done'),
    (5, 4, 'Wire the form to the auth API',          'done')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- sub_tasks  (tasks 2, 3 and 5 intentionally have none)
-- -------------------------------------------------------------------------
INSERT INTO sub_tasks (id, task_id, title, status) VALUES
    (1, 1, 'Validate file size and type',      'todo'),
    (2, 1, 'Store the file and save its URL',  'todo'),
    (3, 4, 'Add the email and password fields', 'done')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- users
--   Shared demo accounts for local development and assessment.
--   Pang and Admin use the same seeded bcrypt password hash.
--   Demo login password: password123
--   User 2 ("Developer") is deliberately seeded with a real, checkable
--   inbox (not a fake @bix.app address) so the Forgot Password flow
--   (US-14, see server/src/services/emailSender.js) is actually
--   demonstrable end to end against a deployed environment - its own
--   demo login password is Password123 (capital P), not the shared one.
-- -------------------------------------------------------------------------
INSERT INTO users (id, name, email, role, password_hash) VALUES
    (1, 'Pang',      'pang@bix.app',               'developer', '$2b$10$unb69kAx.iy7mc3SEKOKGe1xa9G5THJOTwtYGxlN.EQQcu5YtlZjm'),
    (2, 'Developer', 'devtejsingh8276@gmail.com',  'developer', '$2b$10$zDMb8sa6M5Ljx8ssL4hoiOq0XfVB1YIalbKJTcQv954R..bY6B2yO'),
    (3, 'Admin',     'admin@bix.app',               'admin',     '$2b$10$unb69kAx.iy7mc3SEKOKGe1xa9G5THJOTwtYGxlN.EQQcu5YtlZjm')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- project responsibility  (US-04d)
--   The seeded Admin is responsible for BIX Platform (project 1) only.
--   Mobile App (project 2) is deliberately left with no responsible Admin
--   (NULL), so the "Admin not responsible for this project" path can be
--   exercised against real seed data, the same way project 2 already covers
--   the US-05 "not a member" path below.
--
--   Done as an UPDATE here, not in the projects INSERT above, because the
--   projects rows are inserted before users exist. The Admin is looked up by
--   email and role rather than by a hard-coded id; if that account is
--   missing, the subquery is NULL and the project simply stays unowned.
-- -------------------------------------------------------------------------
UPDATE projects
   SET responsible_admin_id = (
         SELECT id FROM users WHERE email = 'admin@bix.app' AND role = 'admin'
       )
 WHERE id = 1
   AND responsible_admin_id IS NULL;

-- -------------------------------------------------------------------------
-- teams
-- -------------------------------------------------------------------------
INSERT INTO teams (id, name) VALUES
    (1, 'Team Alpha')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- team_members  (both developers are on Team Alpha; the admin is on no team)
-- -------------------------------------------------------------------------
INSERT INTO team_members (team_id, user_id) VALUES
    (1, 1),
    (1, 2)
ON CONFLICT (team_id, user_id) DO NOTHING;

-- -------------------------------------------------------------------------
-- project_members
--   Pang (1) and Developer (2) are assigned to BIX Platform (project 1).
--   Neither is assigned to Mobile App (project 2), so it exercises the
--   US-05 "not a member" path against a project with real seed data instead
--   of only a non-existent id.
-- -------------------------------------------------------------------------
INSERT INTO project_members (project_id, user_id) VALUES
    (1, 1),
    (1, 2)
ON CONFLICT (project_id, user_id) DO NOTHING;

-- US-11 (Yichi Zhang): assign seed tasks after users exist.
UPDATE tasks SET assignee_id = 1 WHERE id IN (1, 3, 4) AND assignee_id IS NULL;
UPDATE tasks SET assignee_id = 2 WHERE id IN (2, 5) AND assignee_id IS NULL;

-- -------------------------------------------------------------------------
-- Re-sync identity sequences so the next auto-generated id continues after
-- the highest explicit id inserted above. GREATEST(..., 1) keeps this valid
-- even if a table somehow ended up empty. team_members / project_members
-- have no identity column (composite primary key), so nothing to re-sync.
-- -------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('projects',              'id'), GREATEST((SELECT max(id) FROM projects),              1));
SELECT setval(pg_get_serial_sequence('sprints',               'id'), GREATEST((SELECT max(id) FROM sprints),               1));
SELECT setval(pg_get_serial_sequence('product_backlog_items', 'id'), GREATEST((SELECT max(id) FROM product_backlog_items), 1));
SELECT setval(pg_get_serial_sequence('tasks',                 'id'), GREATEST((SELECT max(id) FROM tasks),                 1));
SELECT setval(pg_get_serial_sequence('sub_tasks',             'id'), GREATEST((SELECT max(id) FROM sub_tasks),             1));
SELECT setval(pg_get_serial_sequence('users',                 'id'), GREATEST((SELECT max(id) FROM users),                 1));
SELECT setval(pg_get_serial_sequence('teams',                 'id'), GREATEST((SELECT max(id) FROM teams),                 1));

COMMIT;
