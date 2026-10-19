# NFR-02 Performance Baseline v2 (Sprint 3 release candidate)

SCRUM-147 NFR-02 Performance Efficiency Baseline / SCRUM-196 T2.4 Define and
measure performance targets.

Baseline v2 re-measures the product after the Sprint 3 features merged, still
**before** any NFR-02 optimisation. Baseline v1 (`baseline.md`, product code
`c0a65c7`) is kept unchanged; this document is the reference point for the
optimisation work that follows.

## 1. Git baseline

| | |
|---|---|
| Product code measured | `363f514` (main after NFR-01, US-16, project membership management, POST /sprints and NFR-03 merged) |
| Measured at | `fac9211` = `363f514` merged into `feature/NFR-02-performance` (perf tooling only, no product changes) |
| Measured on | 2026-10-19 |
| Changes since v1 that could affect timing | helmet and the login rate limiter (app-wide middleware), NFR-03 central error handling and `asyncHandler` on every async route, CORS restriction |

## 2. Dataset and environment

Same isolated database (`bix_performance_test`) and the **same dataset as v1**:
`npm run perf:seed` rebuilt it twice with fingerprint
`23c458c7a22de07294c262dbd2e03d1e`, identical to v1 - 15 users, 8 projects,
32 sprints, 320 PBIs, 1,280 tasks, 2,560 sub-tasks, 168 collaborators. No
schema or migration change happened between v1 and v2.

Local development machine, localhost, Node v22.18.0, PostgreSQL 17.11.

## 3. Methodology

Unchanged from v1 (`server/scripts/perf/benchmark.js`): real HTTP requests to
the real app, 5 warm-up requests, 30 measured runs, median and nearest-rank
p95, queries per request counted in the benchmark process only,
self-restoring mutations, and the dataset fingerprint checked before and after
(unchanged in both runs). Two full runs (A, with EXPLAIN, and B).

## 4. Results and comparison with v1

Times in milliseconds; v2 shows run A / run B.

| Workflow | v1 median | v1 p95 | v1 queries | v2 median (A / B) | v2 p95 (A / B) | v2 queries | Median change | Response v1 → v2 |
|---|---|---|---|---|---|---|---|---|
| Admin dashboard | 6.4 | 9.5 | 1 | 6.2 / 5.7 | 7.4 / 9.8 | 1 | -7% | 39 B → 39 B |
| Developer dashboard | 8.4 | 11.5 | 2 | 7.5 / 7.3 | 8.5 / 8.7 | 2 | -12% | 670 B → 438 B |
| Responsible projects (Admin nav) | 5.9 | 9.1 | 1 | 5.8 / 5.5 | 6.8 / 6.1 | 1 | -4% | 119 B → 119 B |
| Project members (team view) | 6.9 | 10.0 | 3 | 6.6 / 6.7 | 7.8 / 8.0 | 3 | -4% | 283 B → 283 B |
| Project board (Admin) | 14.9 | 18.9 | 6 | 14.1 / 14.3 | 15.3 / 16.2 | 6 | -5% | 157.3 KB → 157.3 KB |
| Project board (Developer) | 14.8 | 19.2 | 7 | 14.6 / 14.7 | 18.2 / 19.9 | 7 | -1% | 157.3 KB → 157.3 KB |
| Product Backlog | 8.4 | 13.0 | 2 | 7.3 / 7.3 | 8.6 / 8.3 | 2 | -13% | 14.2 KB → 14.2 KB |
| PBI breakdown | 8.0 | 12.0 | 5 | 7.1 / 7.2 | 8.0 / 8.3 | 5 | -11% | 2.0 KB → 2.0 KB |
| Completed Work History | 9.6 | 13.1 | 7 | 9.5 / 9.5 | 12.4 / 10.9 | 7 | -1% | 30.7 KB → 30.7 KB |
| Burndown sprint list | 6.1 | 10.1 | 2 | 6.0 / 6.3 | 7.1 / 7.9 | 2 | +1% | 575 B → 575 B |
| Burndown (active sprint) | 7.1 | 10.0 | 3 | 6.6 / 6.6 | 7.4 / 7.4 | 3 | -7% | 1.1 KB → 1.1 KB |
| Create project | 8.6 | 12.2 | 1 | 8.0 / 8.0 | 9.0 / 8.7 | 1 | -7% | 82 B → 82 B |
| Delete empty project | 7.4 | 10.6 | 6 | 7.2 / 7.0 | 10.0 / 7.9 | 6 | -4% | 37 B → 37 B |
| Rename project | 7.0 | 10.9 | 2 | 6.4 / 6.4 | 7.3 / 7.2 | 2 | -9% | 73 B → 73 B |
| Create PBI | 9.4 | 14.3 | 2 | 8.8 / 8.7 | 9.4 / 9.9 | 2 | -7% | 302 B → 302 B |
| Delete PBI | 6.7 | 10.4 | 3 | 6.8 / 6.7 | 9.2 / 7.8 | 3 | +1% | 302 B → 302 B |
| Complete task (with effort) | 10.9 | 14.6 | 5 | 10.3 / 10.2 | 11.2 / 14.4 | 5 | -6% | 182 B → 182 B |
| Analytics by Project / by Sprint | - | - | - | N/A | N/A | - | - | not on main |

**No regression.** Every query count is identical to v1, every response is the
same size except the Developer dashboard (smaller after main's dashboard
rework), and every median is within -13% to +1% of v1. Those small
differences are run-to-run noise on one laptop, not an improvement: the
helmet, rate-limit and NFR-03 middleware added no measurable cost.

Main also added workflows the harness does not measure yet (they are not part
of the v1 comparison): list available developers, add/remove a project
member, and create a sprint.

## 5. Query-count evidence

| Endpoint | Project | PBIs | Tasks | Sub-tasks | Queries |
|---|---|---|---|---|---|
| `GET /board` | seeded | 40 | 160 | 320 | 6 |
| `GET /board` | empty | 0 | 0 | 0 | 6 |
| `GET /completed-work` | seeded | 14 | 56 | 112 | 7 |
| `GET /completed-work` | empty | 0 | 0 | 0 | 7 |

Still no N+1: query counts do not grow with the data. The Developer board
still reads `SELECT id, name FROM projects WHERE id = $1` twice (membership
check, then the board model).

## 6. EXPLAIN (ANALYZE, BUFFERS) findings

Summed SQL execution per read journey is still at most about 1 ms (request
medians 5.5-14.7 ms), so most request time is outside the database.

| Query | Plan | Rows read → returned | Execution |
|---|---|---|---|
| Developer dashboard summary | Seq Scan + aggregate over all `tasks`, `product_backlog_items`, `sprints` | 1,280 + 320 + 32 → 3 projects | 0.66 ms |
| Developer task history | Bitmap Index Scan `idx_tasks_assignee_id` | 134 | 0.21 ms |
| Board sub-tasks | Seq Scan `sub_tasks` + `tasks`, Index Scan `idx_pbi_project_id` | 2,560 + 1,280 → 320 | 0.58 ms |
| Board tasks | Seq Scan `tasks`, Index Scan `idx_pbi_project_id` | 1,280 → 160 | 0.24 ms |
| Burndown scope | Index Scan `idx_pbi_sprint_id` | 10 | 0.04 ms |

Same plans as v1. The dashboard summary and the board task/sub-task queries
still read whole tables; the indexes they could use already exist, and the
planner prefers sequential scans at this table size.

## 7. Frontend bundle

| | v1 (`c0a65c7`) | v2 (`363f514`) |
|---|---|---|
| JS (single chunk) | 253.25 kB / 72.68 kB gzip (58 modules) | 264.53 kB / 75.06 kB gzip (63 modules) |
| CSS | 37.91 kB / 7.23 kB gzip | 40.91 kB / 7.77 kB gzip |

+11.3 kB JS (+2.4 kB gzip) from the Sprint 3 features (NFR-01 error
components, US-16 settings, member management, NFR-03 error boundary and
retry). Still one chunk and no chart library. Per-module estimates: Burndown
page + chart about 2.8 KB gzip; the unmerged analytics pages and charts about
3.6 KB gzip.

## 8. Analytics status

| Story | Status at v2 | Notes |
|---|---|---|
| US-13a Analytics by Project (SCRUM-32) | Unmerged branch `feature/SCRUM-32-project-analytics` (includes SCRUM-33) | Hand-written SVG charts; fixed, parallel, aggregated queries (no N+1) |
| US-13b Analytics by Sprint (SCRUM-33) | Unmerged branch `feature/SCRUM-33-sprint-analytics` | Same |

Analytics stays N/A in this baseline and is measured once it reaches main.

## 9. Targets

| Target | Status at v2 |
|---|---|
| User-facing core flows within about 3 s (Jira/client) | API side far inside it; browser timings not captured (a manual smoke test of the core flows on 2026-10-19 showed no noticeable delay) |
| Provisional internal: reads p95 ≤ 300 ms | Met - slowest read p95 19.9 ms (Developer board) |
| Provisional internal: mutations p95 ≤ 500 ms | Met - slowest mutation p95 14.4 ms (complete task) |

## 10. Limitations

Same as v1: localhost, one machine, one user, no network latency or
concurrency, client and server in one process (no browser rendering), 30
samples per journey (medians stable within about ±8% between runs; p95 noisier).
