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
- **Method** (`npm run perf:bench`, details in [`baseline.md`](baseline.md)
  §5): real HTTP requests to the app, 5 warm-up then 30 measured runs per
  journey, median and p95, queries per request counted in the benchmark
  process, self-restoring mutations, dataset fingerprint checked before and
  after. Baseline v1 (`c0a65c7`) and v2 (`363f514`) were measured this way
  before any optimisation.

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

The dashboard figure here (10.0 ms) and the one in §4 (12.2 ms) come from
different rolled-back experiments - this index audit also added 20,000 PBIs
and 200,000 sub-tasks - so the two timings are not directly comparable.

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
  above. The Analytics endpoints merged later run a fixed 2-3 queries each
  (§10) and were not part of this index audit.

## 7. Route-level lazy loading (SCRUM-195, commit `314d5bb`)

**Dependency status:** Project Analytics (SCRUM-32) and Sprint Analytics
(SCRUM-33) reached main (`5bbff64`) together with US07/US09 (`f7139a8`), which
was merged into this branch (`450af89`), so lazy loading covers all three
reporting pages at once.

**Implementation:** `App.jsx` loads Burndown, Sprint Analytics and Project
Analytics with `React.lazy`, behind one `Suspense` fallback. `ProtectedRoute`
still runs first, so a page is never downloaded for a user who is not allowed
on it; a chunk that fails to download is handled by the existing app-level
ErrorBoundary. No new dependency, no visual or behaviour change.

Production build, same commit before and after the change:

| | Before | After |
|---|---|---|
| Initial JS | 283.28 kB / 79.41 kB gzip (1 chunk) | 269.70 kB / 76.71 kB gzip |
| Initial CSS | 47.36 kB / 8.95 kB gzip | 44.68 kB / 8.39 kB gzip |
| Deferred, loaded on first visit | - | Burndown 6.73 kB / 2.50 kB gzip; Sprint Analytics 4.38 / 1.53; Project Analytics 2.94 / 1.12; shared chart 1.64 / 0.71; analytics CSS 2.68 / 0.91 |

- **Initial download reduction:** JS -13.58 kB raw, **-2.70 kB gzip
  (-3.4% gzip)**; CSS -2.68 kB raw, -0.56 kB gzip. Together about
  -3.3 kB gzip of the first page load.
- The reporting code is **deferred, not removed**: it is downloaded the first
  time one of those pages is opened (5.86 kB gzip of JS across the four
  chunks if all three are visited - slightly more than was saved, because
  small separate files compress less well).
- The gain is modest because the app has no chart library; the bulk of the
  initial bundle is React, React DOM and the router.
- Validation: the two analytics route tests now wait for the lazily loaded
  page; new tests cover the Burndown route (loading state, then page;
  logged-out redirect) and the ErrorBoundary showing its recovery screen when
  a page chunk fails to load.

## 8. Final validation

On `feature/NFR-02-performance` after `314d5bb`, with current main (Analytics,
US07/US09) merged:

| Check | Result |
|---|---|
| Backend tests | 1,041 passed, 14 skipped (optional PostgreSQL suites: US-08c, US07 focus, US09 roles), 0 failed |
| Frontend tests | 411 passed, 0 failed |
| Production build | passes; initial JS 269.70 kB / 76.71 kB gzip plus the deferred chunks in §7 |
| Query count vs data size | board 6 / 6, completed work 7 / 7 (seeded vs empty) |
| Dataset fingerprint | `23c458c7…` before and after every run, including rolled-back experiments |

**Benchmark after the merge.** Two final runs were slower than baseline v2 on
every journey - between 5% and 44%, mostly 15-30% - including journeys no code
change touched. Running the baseline-v2 code (`00c016c`) and the current code
back to back on the same machine, twice each, showed the same slowdown for
both: per-journey medians differed by -5% to +11%, within the run-to-run
spread of identical code (up to about 29%). The shift was machine load, not a
regression. Query counts are unchanged except where merged features added
work:

- Product Backlog: 2 → 3 queries (US07 current-focus lookup);
- board +348 B, sprint list +320 B, backlog and completed work +28 B each
  (US07/US09 focus and sprint-role fields).

## 9. Target compliance

Across the final runs (current code, after the merge):

| Target | Result |
|---|---|
| Reads p95 ≤ 300 ms (provisional) | Met - slowest read p95 24.7 ms (Admin board) |
| Mutations p95 ≤ 500 ms (provisional) | Met - slowest mutation p95 31.7 ms (one Delete PBI run; 10-17 ms in the other runs) |
| Core flows within about 3 s (user-facing) | API time is far inside it; browser timings were not captured, and manual smoke tests of the core flows showed no noticeable delay |

## 10. Post-integration journeys (not part of the v1/v2 comparison)

Measured with the same method (5 warm-up + 30 runs) after Analytics merged:

| Journey | Request | Median (ms) | p95 (ms) | Queries | Response |
|---|---|---|---|---|---|
| Project Analytics | `GET /api/projects/analytics` | 10.5 | 12.5 | 2 | 1,447 B |
| Sprint Analytics | `GET /api/projects/1/analytics/sprints` | 8.2 | 9.5 | 3 | 1,972 B |

Both use a fixed number of aggregated queries (no N+1). Their routes, and
US07's new current-focus and sprint-role routes, were also wrapped with the
NFR-03 `asyncHandler` (`01c31e5`), which they had reached main without.

## 11. Limitations

Localhost, one machine, one user, no network latency or concurrency; the API
benchmark does not include browser rendering, and the bundle figures are
transfer sizes rather than load times. Comparisons are only meaningful on the
same machine and dataset, which is why the final check compares old and new
code back to back.
