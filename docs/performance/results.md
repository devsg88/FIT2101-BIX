# NFR-02 Performance Results

SCRUM-147 NFR-02 Performance Efficiency Baseline. Main evidence document for
the NFR-02 work; the measurements it starts from are in
[`baseline.md`](baseline.md) (v1, product code `c0a65c7`) and
[`baseline-v2.md`](baseline-v2.md) (v2, Sprint 3 release candidate
`363f514`), which are kept unchanged.

## 1. Scope and target

- **User-facing target (Jira/client):** core pages and common actions within
  about 3 seconds for classroom/demo-scale data.
- **Provisional internal targets (not client-agreed):** read APIs p95
  ≤ 300 ms; common mutation APIs p95 ≤ 500 ms.
- **Environment and limits:** isolated database `bix_performance_test` with
  the deterministic dataset from `npm run perf:seed` (fingerprint
  `23c458c7a22de07294c262dbd2e03d1e`: 8 projects, 320 PBIs, 1,280 tasks,
  2,560 sub-tasks). Localhost, one machine, one user, no network latency or
  concurrency; the API benchmark does not include browser rendering.

## 2. Baseline (v2)

Measured on the Sprint 3 release candidate before any optimisation
(full table in [`baseline-v2.md`](baseline-v2.md)):

- every core read p95 ≤ 19.9 ms and every mutation p95 ≤ 14.4 ms;
- query counts and response sizes identical to v1, no regression from the
  Sprint 3 features;
- in each read, the database work totals at most about 1 ms; most request
  time is HTTP, Express and JSON work;
- frontend bundle 264.53 kB / 75.06 kB gzip, one chunk.

The targets were already met. The work below is about how the system
behaves as data grows and about protecting what is already good, not about
fixing a slow product.

## 3. N+1 investigation (SCRUM-194)

**No N+1 query pattern was found.** Nothing was "fixed"; the result is
recorded and protected.

| Evidence | Result |
|---|---|
| Board, seeded project (40 PBIs, 160 tasks, 320 sub-tasks) vs empty project | 6 queries for both (Admin; 7 for a Developer) |
| Completed Work History, seeded vs empty project | 7 queries for both |
| `server/src/models/queryCount.test.js` (commit `a2970e3`): 2 PBIs vs 200 PBIs / 800 tasks / 1,600 sub-tasks | Same number of database calls; no per-item connections |
| Same test with a per-PBI query temporarily injected (not committed) | Fails: board 7 → 205 calls, completed work 7 → 106 calls |

The test now guards against a future change introducing per-item queries.

## 4. Developer dashboard aggregation (commit `fea0c26`)

**Before:** `getProjectSummariesForUser` grouped the sprints and tasks of
**every** project in the database and only then joined the result to the
developer's projects.

**After:** a `my_projects` CTE restricts the sprint and task aggregates to
the developer's projects **before** grouping. It is still one statement and
one round trip.

**What EXPLAIN shows:** at the tested sizes PostgreSQL still scans the
broader `tasks` table with either version, so total scan work can still grow
with the size of the database. What the change removes is the grouping and
counting of other projects' rows.

Execution time of the summary query for the representative developer
(3 projects), on the performance database; extra data was added inside a
transaction that was rolled back:

| Data | Before | After |
|---|---|---|
| Normal dataset (1,280 tasks) | 0.60 ms | 0.56 ms (no meaningful change) |
| + 10,000 unrelated tasks (11,280) | 4.08 ms | 1.71 ms |
| + 100,000 unrelated tasks (101,280) | 34.6 ms | 12.2 ms |

- Same results as the previous query for all 12 developers (and, through the
  edited function, all 15 users), also with the extra data present.
- Same query count (2) and response (438 B) for the dashboard endpoint;
  benchmark median 7.5 / 7.3 ms before, 7.1 ms after - at classroom scale
  the change is within noise; the scaling rows show the real benefit.
- A unit test pins the scoping (both aggregates filtered by
  `my_projects`, one query).
- **Rejected alternative:** a `LEFT JOIN LATERAL` rewrite gave identical
  results but made PostgreSQL rescan `tasks` once per project (3,840 task
  rows read instead of 1,280; 33,840 instead of 11,280 with the extra data),
  so it was not used.

## 5. Board and project-members request concurrency (commit `e5a061c`)

**Before:** `BoardContext` requested the board, waited for it, and only then
requested the project's members (used by the assignee dropdown).

**After:** both requests start together. This removes one network round trip
from the path to a fully loaded board. The API benchmark does not measure
browser request timing, so no millisecond figure is claimed; on localhost
the members request takes about 6.6 ms (median), and over a real network the
saving is one request's latency.

Behaviour kept (`client/src/context/BoardContext.load.test.jsx`):

- the board alone decides ready, error (Retry) or forbidden (AccessDenied);
- the board shows as soon as it arrives, even while members are loading;
- a members failure leaves the members list empty and never fails the board;
- a 403 on the board still shows Access Denied;
- Retry after a transient failure works, with one request of each per load.

The test that checks both requests are in flight before either answers
fails on the previous sequential code.

## 6. Index investigation (SCRUM-193)

**Decision: no additional index is justified.** No migration was added.

Method: the exact SQL the application runs (captured from the real model
functions) was explained with `EXPLAIN (ANALYZE, BUFFERS)` on the
performance database at normal size, then again with 20,000 PBIs, 100,000
tasks and 200,000 sub-tasks of unrelated data added, then with candidate
indexes added - the extra data and indexes inside a transaction that was
rolled back. The planner was never forced (no `enable_seqscan = off`).

| Query (journey) | Filter / join columns | Existing index | Normal size | With unrelated growth |
|---|---|---|---|---|
| Board PBIs | `project_id` | `idx_pbi_project_id` | Seq Scan (7 pages) | Index Scan, 40 rows |
| Board tasks | `pbi_id` via project's PBIs | `idx_tasks_pbi_id` | Seq Scan (16 pages) | Index Scan, 160 rows |
| Board sub-tasks | `task_id` via project's tasks | `idx_sub_tasks_task_id` | Seq Scan (27 pages) | Index Scan, 320 rows |
| Completed work PBIs | `project_id, stage` | `idx_pbi_project_id_stage` (composite) | Seq Scan | Index Scan, 14 rows |
| Completed work collaborators | `pbi_id` via project's PBIs | `pbi_collaborators_pkey` | Seq Scan (168 rows) | Seq Scan (168 rows) |
| Burndown scope | `project_id, sprint_id` | `idx_pbi_sprint_id` | Index Scan, 10 rows | Index Scan, 10 rows |
| Developer task history | `assignee_id` | `idx_tasks_assignee_id` | Seq Scan | Bitmap Index Scan, 134 rows (PBI join by seq scan, 2.1 ms) |
| Developer dashboard summary | `project_id` via user's projects | `idx_pbi_project_id`, `idx_tasks_pbi_id` | Seq Scan | Index Scan on PBIs (120 rows), Seq Scan on tasks (101,280 rows), 10.0 ms |
| Access checks | `project_members (project_id, user_id)`, `projects.id` | primary keys | Seq Scan (31 / 8 rows) | Seq Scan (31 / 9 rows) |

- Sequential scans at normal size are the planner's correct choice for
  tables of 1-27 pages; they are not evidence of a missing index. As the
  tables grow, the planner switches to the existing indexes on its own and
  reads only the project's rows.
- Candidate composite indexes tested (inside the rolled-back transaction):
  - `tasks (pbi_id, status)` - not chosen for the dashboard summary or any
    other query;
  - `product_backlog_items (project_id, sprint_id)` - chosen for burndown
    scope but slower (0.017 → 0.057 ms) than the existing `idx_pbi_sprint_id`;
  - `product_backlog_items (project_id, id)` - chosen for the collaborators
    join but slower (0.090 → 0.138 ms).
- Every extra index adds work to every insert and update of its table and
  storage to maintain - for `tasks`, on every task completion and status
  change - with no measured benefit here.
- **Revisit when:** the dashboard summary's sequential scan of `tasks` shows
  up in measured latency at real data sizes (that is a query-shape question,
  not a missing index), or a new feature filters on columns not covered
  above (e.g. analytics queries once merged).

## 7. Current regression results

On `feature/NFR-02-performance` at `e5a061c`:

| Check | Result |
|---|---|
| Backend tests | 894 passed, 5 skipped (optional US-08c database suite), 0 failed |
| Frontend tests | 327 passed, 0 failed |
| Production build | passes; JS 264.59 kB / 75.06 kB gzip |
| Full benchmark vs v2 | all medians within noise; same query counts on every journey |
| Response sizes | unchanged (create/delete journeys differ by 1-2 bytes as new record ids grow) |
| Query count vs data size | board 6 / 6, completed work 7 / 7 (seeded vs empty) |
| Dataset fingerprint | `23c458c7…` before and after every run, including rolled-back experiments |

## 8. Target compliance

| Target | Result |
|---|---|
| Reads p95 ≤ 300 ms (provisional) | Met - slowest read p95 16.0 ms (Developer board) |
| Mutations p95 ≤ 500 ms (provisional) | Met - slowest mutation p95 10.9 ms (complete task) |
| Core flows within about 3 s (user-facing) | API time is far inside it; browser timings were not captured, and the manual smoke tests of the core flows showed no noticeable delay |

## 9. Remaining work

- **SCRUM-195 lazy loading:** pending. The Burndown page and chart are about
  2.8 KB gzip; the Project and Sprint analytics pages (about 3.6 KB gzip,
  hand-written charts, no chart library) are on unmerged branches. The
  route-level lazy-loading decision will be made once, against the analytics
  merge status, and measured as initial-chunk size before/after.
- The analytics routes will also need checking against these results (query
  shape, indexes) once they reach main.
