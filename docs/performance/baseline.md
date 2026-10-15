# NFR-02 Performance Baseline (BEFORE optimisation)

SCRUM-147 NFR-02 Performance Efficiency Baseline / SCRUM-196 T2.4 Define and
measure performance targets.

This is the measurement taken **before** any NFR-02 optimisation. It is kept
unchanged as the reference point; later results are recorded separately and
compared against it.

## 1. Git baseline

| | |
|---|---|
| Product code measured | `c0a65c7` (main, 2026-10-13) |
| Measured at | `5efbd04` = `c0a65c7` + perf tooling only (no product changes) |
| Branch | `feature/NFR-02-performance` |
| Measured on | 2026-10-15 |

## 2. Purpose

Record how the current product performs on representative classroom-scale
data, so every later NFR-02 change (SCRUM-193 indexes, SCRUM-194 query work,
SCRUM-195 lazy loading) is justified by, and compared against, real numbers.

## 3. Dataset

Isolated database `bix_performance_test`, built by `npm run perf:seed`
(`server/scripts/perf/`). Deterministic: every rebuild gives fingerprint
`23c458c7a22de07294c262dbd2e03d1e`.

| Table | Rows | Shape |
|---|---|---|
| users | 15 | 3 Admins, 12 Developers |
| teams / team_members | 3 / 12 | 4 Developers per team |
| projects | 8 | each with one responsible Admin |
| project_members | 31 | 3-5 Developers per project |
| sprints | 32 | per project: 2 completed, 1 active, 1 planning |
| product_backlog_items | 320 | per project: 14 Completed, 10 Active Sprint, 6 Sprint Planning, 10 Product Backlog |
| tasks | 1,280 | 4 per PBI; done / in progress / to do; effort on done tasks |
| sub_tasks | 2,560 | 2 per task |
| pbi_collaborators | 168 | on completed PBIs |

Measured project (project 1): 40 PBIs, 160 tasks, 320 sub-tasks, 14 completed
PBIs.

## 4. Environment

Local development machine, everything on localhost: Node v22.18.0,
PostgreSQL 17.11, Express app in the same process as the measuring client.

## 5. Methodology

- `npm run perf:bench -- --explain` (see `server/scripts/perf/README.md`).
- Each journey is a real HTTP request to the real app through all middleware,
  controllers and PostgreSQL, timed from sending the request to reading the
  complete response body.
- 5 warm-up requests per journey (discarded), then **30 measured runs**.
- Reported: **median**, **p95** (nearest rank), min, max.
- **Queries per request**: counted by wrapping `pg.Client.prototype.query`
  inside the benchmark process only (includes auth-middleware queries).
- Mutations restore what they change; the dataset fingerprint was identical
  before and after every run.
- Stability: two earlier full runs agreed to within ±8% on every median;
  p95 varied by up to ~25% on single journeys (30 samples on a laptop).

## 6. User-facing target (Jira / client)

Core pages and common actions complete within **approximately 3 seconds**
for representative classroom/demo-scale data.

## 7. Provisional internal targets

**Internal engineering targets, provisional - not client-agreed:**

- read APIs: **p95 ≤ 300 ms**
- common mutation APIs: **p95 ≤ 500 ms**

## 8. Results

All times in milliseconds.

| Journey | Request | Median | p95 | Min | Max | Queries | Response |
|---|---|---|---|---|---|---|---|
| Admin dashboard | `GET /api/dashboard` | 6.4 | 9.5 | 5.2 | 10.6 | 1 | 39 B |
| Developer dashboard | `GET /api/dashboard` | 8.4 | 11.5 | 6.9 | 11.8 | 2 | 670 B |
| Responsible projects (Admin nav) | `GET /api/projects` | 5.9 | 9.1 | 5.1 | 10.2 | 1 | 119 B |
| Project members (team view) | `GET /api/projects/:id/members` | 6.9 | 10.0 | 6.1 | 10.2 | 3 | 283 B |
| Project board (Admin) | `GET /api/projects/:id/board` | 14.9 | 18.9 | 13.5 | 30.1 | 6 | 157.3 KB |
| Project board (Developer) | `GET /api/projects/:id/board` | 14.8 | 19.2 | 13.7 | 22.0 | 7 | 157.3 KB |
| Product Backlog | `GET /api/projects/:id/pbis` | 8.4 | 13.0 | 7.2 | 14.4 | 2 | 14.2 KB |
| PBI breakdown | `GET /api/projects/:id/pbis/:id` | 8.0 | 12.0 | 6.8 | 12.8 | 5 | 2.0 KB |
| Completed Work History | `GET /api/projects/:id/completed-work` | 9.6 | 13.1 | 8.7 | 13.8 | 7 | 30.7 KB |
| Burndown sprint list | `GET /api/projects/:id/sprints` | 6.1 | 10.1 | 5.5 | 10.7 | 2 | 575 B |
| Burndown (active sprint) | `GET /api/projects/:id/sprints/:id/burndown` | 7.1 | 10.0 | 6.2 | 10.2 | 3 | 1.1 KB |
| Create project | `POST /api/projects` | 8.6 | 12.2 | 7.9 | 12.6 | 1 | 82 B |
| Delete empty project | `DELETE /api/projects/:id` | 7.4 | 10.6 | 6.4 | 11.2 | 6 | 37 B |
| Rename project | `PATCH /api/projects/:id` | 7.0 | 10.9 | 6.2 | 14.9 | 2 | 73 B |
| Create PBI | `POST /api/projects/:id/pbis` | 9.4 | 14.3 | 8.1 | 15.3 | 2 | 302 B |
| Delete PBI | `DELETE /api/projects/:id/pbis/:id` | 6.7 | 10.4 | 6.0 | 10.6 | 3 | 302 B |
| Complete task (with effort) | `POST /api/projects/:id/tasks/:id/complete` | 10.9 | 14.6 | 9.3 | 14.6 | 5 | 182 B |
| Analytics by Project / by Sprint | - | N/A | N/A | | | | not implemented |

Against the targets: slowest read p95 19.2 ms (board), slowest mutation p95
14.6 ms (complete task). Server-side API time is well inside both the 3 s
user-facing target and the provisional internal targets at this scale. This
measures the API only - browser rendering is not included (see section 13).

## 9. Query-count evidence

Same endpoints on the seeded project and on a temporary empty project:

| Endpoint | Project | PBIs | Tasks | Sub-tasks | Queries |
|---|---|---|---|---|---|
| `GET /board` | seeded | 40 | 160 | 320 | 6 |
| `GET /board` | empty | 0 | 0 | 0 | 6 |
| `GET /completed-work` | seeded | 14 | 56 | 112 | 7 |
| `GET /completed-work` | empty | 0 | 0 | 0 | 7 |

The query count does not grow with the data, so **no N+1 pattern** (one query
per returned record) exists in these journeys. Board = 1 access-check query
(2 for a Developer) + 5 fixed board queries. Completed work = 1 access check +
6 fixed queries. Several fixed queries per request are not an N+1.

Redundant lookups seen in the counts:

- Developer board runs `SELECT id, name FROM projects WHERE id = $1` twice
  (membership middleware, then the board model); the Admin board runs the
  responsibility check and then the same project lookup.
- PBI breakdown (5) and burndown (3) read their parent records one after
  another (`getSprintById` then `getSprintScope` for burndown).

## 10. EXPLAIN (ANALYZE, BUFFERS) findings

Run only on the performance database, only on the read statements the
journeys actually executed.

| Query | Plan | Rows read → returned | Execution |
|---|---|---|---|
| Developer dashboard summary (`getProjectSummariesForUser`) | Seq Scan + HashAggregate over **all** `tasks`, `product_backlog_items`, `sprints` | 1,280 tasks + 320 PBIs + 32 sprints → 3 projects | 0.65 ms |
| Board sub-tasks (`getSubTasksByProject`) | Seq Scan on `sub_tasks` and `tasks`, Index Scan `idx_pbi_project_id` | 2,560 sub-tasks + 1,280 tasks → 320 | 0.52 ms |
| Board tasks (`getTasksByProject`) | Seq Scan on `tasks`, Index Scan `idx_pbi_project_id` | 1,280 → 160 | 0.22 ms |
| Board / backlog / completed PBIs | Index Scan `idx_pbi_project_id` | 40 | ≤ 0.04 ms |
| Burndown scope (`getSprintScope`) | Index Scan `idx_pbi_sprint_id` | 10 | 0.04 ms |
| PBI breakdown tasks / sub-tasks | Index Scans `idx_tasks_pbi_id`, `idx_sub_tasks_task_id` | 4 / 8 | 0.03 ms |
| Completed-work collaborators | Seq Scan `pbi_collaborators`, `users` | 168 → 21 | 0.12 ms |
| Responsible projects, access checks | Seq Scan `projects` / `project_members` | 8 / 31 rows | ≤ 0.02 ms |

Summed SQL execution per read journey is **≤ 1.0 ms**, against request
medians of 5.9-14.9 ms: at this scale most request time is outside the
database (HTTP, Express, JSON, driver round trips). Sequential scans on
tables of 8-31 rows are the planner's normal choice and say nothing about
indexes. The dashboard summary and the board task/sub-task queries are
different: their work follows the size of the **whole** tables, not of the
requested project or user.

## 11. Frontend bundle baseline

`vite build` of `c0a65c7`:

| Asset | Raw | gzip |
|---|---|---|
| `index-*.js` (single chunk, 58 modules) | 253.25 kB | 72.68 kB |
| `index-*.css` | 37.91 kB | 7.23 kB |

No chart library is used: the Burndown chart is a hand-written SVG
component. Burndown page + chart are about 6.7 KB minified / 2.7 KB gzip
(per-module esbuild estimate), roughly 4% of the gzip JS.

## 12. Findings (no optimisation yet)

1. All measured journeys are far inside the 3 s user-facing target and the
   provisional internal API targets on this dataset.
2. **No genuine N+1**: board and completed-work query counts are identical
   for 40 PBIs and for 0.
3. **The developer dashboard summary processes every task, PBI and sprint in
   the database** to return the current user's 3 projects; its cost grows
   with the whole database rather than with the user's projects.
4. **Board task and sub-task queries scan the whole `tasks` and `sub_tasks`
   tables** to return one project's rows, although `idx_tasks_pbi_id` and
   `idx_sub_tasks_task_id` exist. That is a reasonable plan at this table
   size; whether it matters at larger sizes needs later evidence.
5. **The board is the heaviest response** (157 KB: every PBI with nested
   tasks, sub-tasks and descriptions) and the slowest journey (about twice
   the other reads) while its SQL takes under 1 ms.
6. Burndown reads sprint then scope one after the other; one project lookup
   is repeated on board requests. Both are small fixed costs.
7. The board page loads the board, then project members, as two sequential
   client requests (from the code; not timed by this API benchmark).
8. Existing foreign-key indexes are broadly adequate. A composite
   `(project_id, sprint_id)` index for burndown is **not** supported by this
   evidence (the current scan takes 0.04 ms).
9. Lazy loading Burndown could remove at most about 2.7 KB gzip from the
   initial bundle; there is no heavy chart dependency at this baseline.

## 13. Limitations

- Localhost only, one machine, one user: no network latency, no concurrent
  load, no load testing.
- Client and server in one Node process: times include HTTP and JSON work but
  not browser parsing or rendering. Browser timings were not captured in this
  baseline.
- 30 samples per journey: medians are stable (±8% across runs); p95 is
  noisier.
- The active sprint's burndown depends on the current date.
- Absolute numbers depend on this machine; comparisons are only meaningful
  on the same machine and dataset.

## 14. Analytics

Analytics by Project (US-13a / SCRUM-32) and by Sprint (US-13b / SCRUM-33)
are not implemented at this baseline. They are reported as N/A and will be
measured once those stories land.
