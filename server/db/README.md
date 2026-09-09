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

> **Status:** these scripts have **not** been executed against any database.
> See [What was validated](#what-was-validated).

---

## Tables

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| `id`   | `bigint` identity | Primary key. |
| `name` | `text` | `NOT NULL`. |

Top of the hierarchy. A project may have no sprints and no PBIs.

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

---

## Running the scripts

Run against your existing local database (the task refers to `bix_dev`; the
committed `server/.env.example` uses `bix` — **confirm which name your setup
uses** and substitute it below). The scripts do not name a database and do not
contain credentials; they run against whatever database you connect to.

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

Another developer owns the `users` table and all authentication. **These
scripts create no user table, no accounts and no auth logic**, and they run
without the `users` table present.

The ERD's dotted lines (assignment of work to people) are therefore **not
implemented**. Before they can be, the two developers need to agree on:

1. **User id type.** The tables here use `bigint` identity ids. Any assignment
   column must match the `users` primary key type exactly (`bigint` vs `integer`
   vs `uuid`) or the foreign key will not create.
2. **Users table name and key.** Confirm it is `users` with primary key `id`
   (that is what `server/src/models/userModel.js` and `authController.js` imply,
   but it is not defined anywhere in this repo).
3. **Which assignment fields are needed, and their names.** Candidates:
   - PBI owner / assignee — e.g. `product_backlog_items.assignee_id`
   - Task assignee — e.g. `tasks.assignee_id`
   - Sub-task assignee — e.g. `sub_tasks.assignee_id`
   - PBI author / reporter — e.g. `product_backlog_items.created_by`
   - Sprint owner / scrum master — e.g. `sprints.created_by`
4. **Person vs role.** US-10 refers to "saved role information". Decide whether
   work is assigned to a specific user, to a role, or both — and whether a
   separate `project_members` / role table is required. (Out of scope for these
   scripts; flagged only.)
5. **Nullability.** Assume unassigned work is allowed, i.e. the assignment
   columns are nullable? (Most likely yes.)
6. **Delete behaviour for user foreign keys.** When a user is removed, should
   their assignments become `NULL` (`ON DELETE SET NULL`), be blocked
   (`RESTRICT`), or does the `users` table use soft-deletes so it never
   happens?
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
| 6 | **Database name** | Task says `bix_dev`; `server/.env.example` says `bix`. Not a schema issue — just confirm which the team uses locally. |
| 7 | **`numeric(6,2)` for hours** | Allows up to `9999.99` hours with 2 decimal places. Adjust precision/scale if the team expects a different range or granularity. |

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
  `server/src/config/db.js` (connection pool), `server/src/models/userModel.js`
  and `server/src/controllers/authController.js` (both `users`-table only).
  Nothing else defines `projects`, `sprints`, `product_backlog_items`, `tasks`
  or `sub_tasks`.

**Not done:** the scripts were **not executed** against any database. No
database was created or modified. No `.env` file was read. Running the scripts
and confirming the results is left to you.
