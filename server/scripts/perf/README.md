# Performance tooling (NFR-02 / SCRUM-147)

Scripts for measuring the product against a representative, reproducible
dataset. They never touch the normal development database.

## Safety rule

Every script here resets or measures a database, so each one first calls
`openPerfPool()` (`perfDatabase.js`) and refuses to run unless:

1. `PERF_DATABASE_URL` is set;
2. it is not the same database as `DATABASE_URL`;
3. its database name contains `perf`;
4. the connected `current_database()` is the one named in the URL;
5. the connected user owns that database;
6. the database comment is exactly
   `BIX performance test database - safe to reset`.

Refusals name the failed rule only - connection strings and passwords are
never printed.

## One-time setup

A PostgreSQL superuser creates the database, owned by the role the server
already uses, and marks it as safe to reset:

```sql
CREATE DATABASE bix_performance_test OWNER <app role>;
COMMENT ON DATABASE bix_performance_test IS 'BIX performance test database - safe to reset';
```

Then add to `server/.env` (gitignored) the same connection string as
`DATABASE_URL`, with only the database name changed:

```
PERF_DATABASE_URL=postgresql://<user>:<password>@localhost:5432/bix_performance_test
```

## Seed the dataset

```bash
cd server
npm run perf:seed
```

This drops and rebuilds the perf database's `public` schema (`schema.sql`,
then `migrations/001_task_subtask_assignee_and_status.sql` - the one migration
not already folded into `schema.sql` for a fresh database), then inserts the
deterministic dataset from `perfDataset.js`:

| Table | Rows |
|---|---|
| users (3 Admins, 12 Developers) | 15 |
| teams / team_members | 3 / 12 |
| projects / project_members | 8 / 31 |
| sprints (per project: 2 completed, 1 active, 1 planning) | 32 |
| product_backlog_items (40 per project) | 320 |
| tasks (4 per PBI) | 1,280 |
| sub_tasks (2 per task) | 2,560 |
| pbi_collaborators | 168 |

Rerunning rebuilds the same rows (the printed fingerprint is identical), so
results stay comparable across runs. Seeded accounts cannot log in: the
benchmark signs its own tokens for them.
