# Database scripts — Product Backlog & Sprint Workflow

Raw PostgreSQL scripts for Journey 3 (US-06, US-08a, US-08b, US-10): the
project board stages, sprints, Product Backlog Items, tasks and sub-tasks.

This project has **no ORM and no migration framework**. The scripts here are
run by hand, matching the existing approach (`server/src/config/db.js` opens a
plain `pg` pool against `DATABASE_URL`).

| File | Purpose |
|------|---------|
| `schema.sql` | Creates the tables, constraints, indexes and the `updated_at` trigger. |
| `seed.sql`   | Inserts a small, consistent set of sample rows for local development. |
| `README.md`  | This document. |

> **Status:** these scripts have been successfully executed against a fresh
> local PostgreSQL database and tested with the running application.
> See [What was validated](#what-was-validated).

---

## Tables

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| `id`   | `bigint` identity | Primary key. |
| `name` | `text` | `NOT NULL`. |
| `responsible_admin_id` | `bigint` | **Nullable.** FK → `users(id)`, `ON DELETE RESTRICT`. Indexed. The Admin responsible for the project (US-04d). |

Top of the hierarchy. A project may have no sprints and no PBIs.

`responsible_admin_id` is the US-04d source of truth for which Admin is
responsible for a project. The Admin who creates a project
(`POST /api/projects`) is recorded here. `project_members` remains project
membership (US-05) and is not used for responsible-Admin ownership — the
responsible Admin is not added there.

`requireProjectResponsibility` (middleware) and `getProjectResponsibility`
(model) provide the responsibility check and are covered by unit tests. The
related Admin stories (US-04a, US-04b, US-04c) are expected to use them; as of
US-04d, no live management route uses `requireProjectResponsibility` yet.
Where the guard is applied, a project whose `responsible_admin_id` is `NULL`
is refused for every Admin.

- `schema.sql` includes this column, so a fresh setup needs no migration for it.
- A database set up before US-04d gets it from
  `migrations/003_us04d_project_responsible_admin.sql`. The migration only adds
  the column, foreign key and index; it assigns no responsible Admin, so
  existing projects start with `NULL`.
- When re-run, `seed.sql` assigns the seeded Admin (`admin@bix.app`) to BIX
  Platform (project 1) only where `responsible_admin_id` is `NULL`. Mobile App
  (project 2) intentionally remains unowned, as the seeded "Admin not
  responsible for this project" case.

### `sprints`
| Column | Type | Notes |
|--------|------|-------|
| `id`         | `bigint` identity | Primary key. |
| `project_id` | `bigint` | `NOT NULL`. FK → `projects(id)`. |
| `name`       | `text` | `NOT NULL`. |
| `status`     | `text` | `NOT NULL`, default `'planning'`. `CHECK` in (`planning`, `active`, `completed`). |
| `started_at` | `timestamptz` | Nullable. Left `NULL` until the sprint is started (US-10); set by the application at that point. |
| `created_at` | `timestamptz` | `NOT NULL`, default `now()`. |

Also carries `UNIQUE (id, project_id)` — this exists only so a PBI can point a
foreign key at `(sprint_id, project_id)`; see the same-project rule below.

Each sprint belongs to exactly one project. A sprint may have no PBIs.

### `product_backlog_items`
| Column | Type | Notes |
|--------|------|-------|
| `id`                 | `bigint` identity | Primary key. Stable for the life of the PBI — the row is never re-created when the PBI changes stage. |
| `project_id`         | `bigint` | `NOT NULL`. FK → `projects(id)`. |
| `sprint_id`          | `bigint` | **Nullable.** `NULL` while the PBI is in the Product Backlog. |
| `title`              | `text` | `NOT NULL`. |
| `description`        | `text` | Nullable. |
| `stage`              | `text` | `NOT NULL`, default `'product_backlog'`. `CHECK` in (`product_backlog`, `sprint_planning`, `active_sprint`, `completed`). Drives which board column the PBI shows in. |
| `planned_start_date` | `date` | Nullable. Entered during Sprint Planning (US-08b). |
| `planned_end_date`   | `date` | Nullable. `CHECK`: not earlier than `planned_start_date` when both are set. |
| `estimated_hours`    | `numeric(6,2)` | Nullable. `CHECK (>= 0)`. |
| `actual_hours`       | `numeric(6,2)` | Nullable. `CHECK (>= 0)`. Separate column from `estimated_hours` — one is never written from the other. |
| `created_at`         | `timestamptz` | `NOT NULL`, default `now()`. |
| `updated_at`         | `timestamptz` | `NOT NULL`, default `now()`. Maintained by trigger — see below. |

### `tasks`
| Column | Type | Notes |
|--------|------|-------|
| `id`     | `bigint` identity | Primary key. |
| `pbi_id` | `bigint` | `NOT NULL`. FK → `product_backlog_items(id)`. |
| `title`  | `text` | `NOT NULL`. |
| `status` | `text` | **Nullable, no default, no `CHECK`** — the allowed values were not specified. See [Open questions and flags](#open-questions-and-flags). |

Each task belongs to exactly one PBI. A PBI may have no tasks.

### `sub_tasks`
| Column | Type | Notes |
|--------|------|-------|
| `id`      | `bigint` identity | Primary key. |
| `task_id` | `bigint` | `NOT NULL`. FK → `tasks(id)`. |
| `title`   | `text` | `NOT NULL`. |
| `status`  | `text` | **Nullable, no default, no `CHECK`** — same as `tasks.status`. |

Each sub-task belongs to exactly one task. A task may have no sub-tasks.

### `users`
| Column          | Type | Notes |
|-----------------|------|-------|
| `id`            | `bigint` identity | Primary key. |
| `name`          | `text` | `NOT NULL`. |
| `email`         | `text` | `NOT NULL`, `UNIQUE`. |
| `role`          | `text` | `NOT NULL`. `CHECK` in (`admin`, `developer`). |
| `password_hash` | `text` | `NOT NULL`. bcrypt hash. |
| `created_at`    | `timestamptz` | `NOT NULL`, default `now()`. |

Resolves the "Pending integration with login / users" gap below this table
was previously tracking: this is exactly the table `server/src/models/userModel.js`
and `authController.js` already query (`SELECT * FROM users WHERE email = $1`),
now actually defined.

### `teams`
| Column       | Type | Notes |
|--------------|------|-------|
| `id`         | `bigint` identity | Primary key. |
| `name`       | `text` | `NOT NULL`, `UNIQUE`. |
| `created_at` | `timestamptz` | `NOT NULL`, default `now()`. |

A developer team, independent of any one project.

### `team_members`
| Column       | Type | Notes |
|--------------|------|-------|
| `team_id`    | `bigint` | `NOT NULL`. FK → `teams(id)`, `ON DELETE CASCADE`. |
| `user_id`    | `bigint` | `NOT NULL`. FK → `users(id)`, `ON DELETE CASCADE`. |
| `created_at` | `timestamptz` | `NOT NULL`, default `now()`. |

`PRIMARY KEY (team_id, user_id)` — a user can be on a given team at most once.

### `project_members`
| Column       | Type | Notes |
|--------------|------|-------|
| `project_id` | `bigint` | `NOT NULL`. FK → `projects(id)`, `ON DELETE CASCADE`. |
| `user_id`    | `bigint` | `NOT NULL`. FK → `users(id)`, `ON DELETE CASCADE`. |
| `created_at` | `timestamptz` | `NOT NULL`, default `now()`. |

`PRIMARY KEY (project_id, user_id)` — a user can be a member of a given
project at most once. This is what US-05 project access is checked against
(`server/src/models/projectMembershipModel.js`). **Deliberately independent
of `team_members`** — a developer's team and the projects they can access
are tracked separately, not derived from one another. See the comment block
above the `users` table in `schema.sql` for the reasoning.

---

## Relationships

```
projects ──1:N── sprints
    │                 │
    │ 1:N             │ 0..1  (product_backlog_items.sprint_id, nullable)
    ▼                 ▼
       product_backlog_items ──1:N── tasks ──1:N── sub_tasks
```

- **Each sprint belongs to one project** — `sprints.project_id` → `projects(id)`, `NOT NULL`.
- **Each PBI belongs to one project** — `product_backlog_items.project_id` → `projects(id)`, `NOT NULL`.
- **Each PBI optionally belongs to one sprint** — `product_backlog_items.sprint_id` is nullable.
- **A PBI's sprint must be in the same project as the PBI** — enforced by a
  multi-column foreign key: `(sprint_id, project_id)` → `sprints(id, project_id)`.
  With PostgreSQL's default `MATCH SIMPLE`, this constraint is skipped entirely
  when `sprint_id IS NULL` (correct for Product Backlog items) and fully
  enforced when `sprint_id` is set. Because it references `sprints(id, project_id)`,
  a mismatched project is impossible.
- **Each task belongs to one PBI** — `tasks.pbi_id` → `product_backlog_items(id)`, `NOT NULL`.
- **Each sub-task belongs to one task** — `sub_tasks.task_id` → `tasks(id)`, `NOT NULL`.
- **Empty parents are allowed** — a project with no sprints/PBIs, a sprint with
  no PBIs, a PBI with no tasks, and a task with no sub-tasks are all valid.

---

## Constraints summary

| Rule | Where | Enforced by |
|------|-------|-------------|
| `sprints.status` is one of `planning` / `active` / `completed` | `sprints` | `CHECK` |
| `product_backlog_items.stage` is one of the four board stages | `product_backlog_items` | `CHECK` |
| `estimated_hours` / `actual_hours` cannot be negative | `product_backlog_items` | `CHECK (>= 0)` (each column, independently; `NULL` allowed) |
| `planned_end_date` not before `planned_start_date` | `product_backlog_items` | `CHECK` (passes if either date is `NULL`) |
| A PBI's sprint is in the PBI's project | `product_backlog_items` | multi-column FK to `sprints(id, project_id)` |
| Referential integrity for every parent link | all child tables | `FOREIGN KEY ... ON DELETE RESTRICT` |
| Indexes on every FK column, plus `(project_id, stage)` on PBIs for board queries | all tables | `CREATE INDEX` |

Only the rules listed in the task were implemented. No additional business
rules were invented — see [Open questions and flags](#open-questions-and-flags)
for rules that were considered but deliberately left out.

### How `updated_at` is maintained

`product_backlog_items` is the only table with an `updated_at` column (it is
the only one the user stories require to track edits — planned dates and hours
change over its lifetime).

- On `INSERT`, the column defaults to `now()`.
- On `UPDATE`, a `BEFORE UPDATE ... FOR EACH ROW` trigger (`trg_pbi_set_updated_at`,
  calling `set_updated_at()`) overwrites `updated_at` with `now()`.

The trigger runs regardless of what the `UPDATE` statement sets, so application
code cannot forget to bump the timestamp and cannot back-date it. `created_at`
is never modified. If you would rather set `updated_at` from the application
layer instead, drop the trigger and the function and set the column explicitly
in every `UPDATE` — but the trigger is the safer default and is what the script
installs.

### Deletion behaviour (not cascading)

**Every foreign key uses `ON DELETE RESTRICT`.** Deletes do **not** cascade.
Concretely:

| You try to delete… | …and it is blocked while |
|--------------------|--------------------------|
| a `project` | it still has any `sprints` or `product_backlog_items` |
| a `sprint` | any `product_backlog_items` still reference it |
| a `product_backlog_item` | it still has any `tasks` |
| a `task` | it still has any `sub_tasks` |

To remove something, delete its children first, bottom-up:
`sub_tasks` → `tasks` → `product_backlog_items` → `sprints` → `projects`.

This is a deliberate choice: it prevents accidental bulk data loss, and the
task explicitly said not to assume cascading deletion. If the team later
decides that deleting a PBI *should* remove its tasks and sub-tasks, change
`tasks.pbi_id` and `sub_tasks.task_id` to `ON DELETE CASCADE` in a migration.
For `product_backlog_items.sprint_id`, an alternative worth discussing is
`ON DELETE SET NULL` (deleting a sprint returns its PBIs to "no sprint") — but
that also needs the PBI's `stage` to be reconsidered at the same time, so it is
left as `RESTRICT` pending a decision.

**Exception: `team_members` and `project_members` use `ON DELETE CASCADE`.**
Both of their foreign keys (to `teams`/`projects` and to `users`) cascade,
unlike every table above. The reasoning is narrower than the tables above: a
membership row is a pure link with no content of its own — deleting a team,
project or user should simply remove the now-meaningless membership rows
along with it, not block the delete the way losing real work data would.

---

## Running the scripts

Run against your configured local PostgreSQL database. The committed
`server/.env.example` uses `bix` as the example database name, but another
database name may be used as long as `DATABASE_URL` points to it. The scripts
do not contain credentials; they run against whatever database you connect to.

**Execution order: `schema.sql` first, then `seed.sql`.** `seed.sql` will fail
with foreign-key / missing-table errors if the schema is not there yet.

### psql

```bash
# from the repository root
psql "postgresql://<user>@localhost:5432/<database>" -f server/db/schema.sql
psql "postgresql://<user>@localhost:5432/<database>" -f server/db/seed.sql
```

Or from an interactive `psql` session already connected to the right database:

```
\i server/db/schema.sql
\i server/db/seed.sql
```

### pgAdmin

1. In the browser tree, expand your server and click the target database.
2. **Tools → Query Tool**.
3. Open `server/db/schema.sql` (folder icon → *Open File*), then run it (▶ or F5).
4. Open `server/db/seed.sql` in the same Query Tool and run it.

### Re-running

Both scripts are safe to run again — neither drops a table or deletes data.

- **`schema.sql`** uses `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
  and `CREATE OR REPLACE FUNCTION`, and recreates the trigger. Re-running is a
  no-op for objects that already exist. **It does not migrate an existing
  table** — if you edit this file after the tables exist, the changes will not
  be applied by a re-run; write a separate migration script instead.
- **`seed.sql`** uses `INSERT ... ON CONFLICT (id) DO NOTHING`, so rows that
  already exist are left as they are (they are **not** updated to match the
  file). The sequence re-sync at the end runs every time and is harmless.

### Starting over (not part of normal setup)

There is intentionally no reset command in the scripts. If you genuinely need a
clean slate in local development, run this **manually** and only with intent —
it destroys all data in these tables:

```sql
-- DESTRUCTIVE. Local development only. Not part of the normal workflow.
DROP TABLE IF EXISTS sub_tasks, tasks, product_backlog_items, sprints, projects CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
```

Then re-run `schema.sql` and `seed.sql`.

---

## Pending integration with login / users

**Update:** `users`, `teams`, `team_members` and `project_members` now exist
(see the [Tables](#tables) section above) — this resolves points 1, 2 and
half of point 3 below (a `project_members` table, item 3's second bullet).
`server/src/models/userModel.js`'s `findUserByEmail` and the new
`teamModel.js` / `projectMembershipModel.js` all use this same `users` table.

What's still **not** implemented is per-work-item assignment — the ERD's
dotted lines from a user to an individual PBI / task / sub-task (e.g. "who is
working on this task"), as opposed to team/project *membership* (who can see
a project at all), which is what was added. Before assignee columns are
added, agree on:

1. ~~User id type.~~ Resolved: `bigint` identity, matching every other table.
2. ~~Users table name and key.~~ Resolved: `users`, primary key `id`.
3. **Which assignment fields are needed, and their names.** Candidates:
   - PBI owner / assignee — e.g. `product_backlog_items.assignee_id`
   - Task assignee — e.g. `tasks.assignee_id`
   - Sub-task assignee — e.g. `sub_tasks.assignee_id`
   - PBI author / reporter — e.g. `product_backlog_items.created_by`
   - Sprint owner / scrum master — e.g. `sprints.created_by`
4. **Person vs role.** US-10 refers to "saved role information". Decide whether
   work is assigned to a specific user, to a role, or both.
5. **Nullability.** Assume unassigned work is allowed, i.e. the assignment
   columns are nullable? (Most likely yes.)
6. **Delete behaviour for user foreign keys.** When a user is removed, should
   their assignments become `NULL` (`ON DELETE SET NULL`), be blocked
   (`RESTRICT`), or does the `users` table use soft-deletes so it never
   happens? (`team_members` / `project_members` answered this for
   *membership* with `CASCADE` — see "Deletion behaviour" above — but that
   reasoning doesn't necessarily carry over to per-work-item assignment.)
7. **One assignee or many** per work item.

Once agreed, the assignment columns are added in a follow-up migration as
`ALTER TABLE ... ADD COLUMN ... REFERENCES users(id) ...` — not by editing
`schema.sql`.

---

## Open questions and flags

| # | Item | Decision needed |
|---|------|-----------------|
| 1 | **`tasks.status` / `sub_tasks.status` values** | Not specified. Columns are currently free text with no default and no `CHECK`. Agree the vocabulary (e.g. `todo` / `in_progress` / `done`), whether the column is `NOT NULL`, and a default; then add a `CHECK` via migration. The seed uses `todo` / `in_progress` / `done` as placeholders only. |
| 2 | **`stage` default `'product_backlog'`** | Convenience so a new PBI lands in the backlog. An explicit value can always be supplied on insert. Confirm this is acceptable. |
| 3 | **`sprints.status` default `'planning'`** | Same idea — a new sprint starts in planning. Confirm. |
| 4 | **`started_at` vs `status`** | The schema does **not** force `started_at` to be non-null when `status = 'active'`, nor null when `status = 'planning'`. That cross-field rule was not in the spec; add it later if wanted. |
| 5 | **`stage` vs `sprint_id` consistency** | The schema allows, e.g., `stage = 'active_sprint'` with `sprint_id IS NULL`. Keeping those two in step is currently the application's responsibility (the "workflow functions" from US-06). A `CHECK` could enforce it later; not added because it was not specified. |
| 6 | **Database name** | `server/.env.example` uses `bix` as the example database name. Other local database names are supported as long as `DATABASE_URL` matches. |
| 7 | **`numeric(6,2)` for hours** | Allows up to `9999.99` hours with 2 decimal places. Adjust precision/scale if the team expects a different range or granularity. |
| 8 | **No `team` ↔ `project` relationship, no per-team role (e.g. Product Owner)** | `teams` and `projects` are unrelated tables — nothing says which project(s) a team is currently working on, and `team_members` records only "on the team", not a role like Product Owner within it. This blocks populating the admin "Team Health & Active Sprints" table (current project, sprint progress, status, product owner per team) with real data; that table currently renders from mock data (`client/src/data/orgMockData.js`) for this reason. **Deferred to a later sprint** — none of the three required journeys (US-01/US-02, US-03/US-05, US-06/US-08a/US-08b/US-10) depend on this table; Journey 2's "admin assigns developer" flow uses `project_members` directly and is unaffected. When picked up, decide: does a project belong to one team or can several teams share a project (1:N vs N:N — a join table `team_projects` handles either), and is a team role (e.g. `team_members.role_on_team`) needed, or does "Product Owner" map to the existing global `admin`/`developer` role. |

---

## What was validated

- **Static review** of both scripts for PostgreSQL syntax and for use of
  features available in PostgreSQL 12+ (identity columns, multi-column foreign
  key with `MATCH SIMPLE`, `pg_get_serial_sequence`, a PL/pgSQL `BEFORE UPDATE`
  trigger).
- **Every seed row checked against every constraint**: all foreign keys resolve
  (`project_id`, `sprint_id`, `pbi_id`, `task_id`), all `status` / `stage`
  values are in their `CHECK` lists, every `(sprint_id, project_id)` pair
  matches a real sprint's project, no `estimated_hours` / `actual_hours` is
  negative, and every populated `planned_end_date` is on or after its
  `planned_start_date`.
- **Repository check** for conflicting definitions: there are no other `.sql`
  files and no migration framework. The only DB-touching code is
  `server/src/config/db.js` (connection pool), `server/src/models/userModel.js`,
  `server/src/models/teamModel.js`, `server/src/models/projectMembershipModel.js`
  and `server/src/controllers/authController.js`. Nothing else defines
  `projects`, `sprints`, `product_backlog_items`, `tasks`, `sub_tasks`, `users`,
  `teams`, `team_members` or `project_members`.
- **`users` / `teams` / `team_members` / `project_members` seed rows checked**
  against every constraint the same way as the tables above: the three seeded
  users provide shared local-development accounts for authentication, both
  developers' `team_members` rows reference the one seeded team, and both
  `project_members` rows reference project 1 (which exists in the existing
  PBI/sprint seed data).

**Runtime validation completed:** `schema.sql` and `seed.sql` were executed
successfully against a fresh local PostgreSQL database. The seeded Admin and
Developer accounts were then authenticated through the running application,
confirming the database setup, bcrypt authentication, JWT flow and role-based
dashboards work together.
