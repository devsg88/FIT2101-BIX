// NFR-02 / SCRUM-196. Repeatable API benchmark against the performance dataset.
//
//   npm run perf:seed                      (once, or to reset the dataset)
//   npm run perf:bench                     (30 measured runs per journey)
//   npm run perf:bench -- --runs 50 --explain --json <file>
//
// What is measured: each journey is a real HTTP request to the real Express
// app (src/app.js, listening on an ephemeral localhost port), through every
// middleware and controller down to PostgreSQL. Times are wall-clock from
// sending the request to reading the whole response body, in this process.
//
// Method: 5 warm-up requests per journey (not recorded), then N measured runs
// (default 30), reported as median and p95 (nearest rank), plus min/max.
// Queries per request are counted by wrapping pg.Client.prototype.query in
// THIS process only - the application code is not changed.
//
// SAFETY: openPerfPool() must positively identify the performance database
// before anything runs (see perfDatabase.js), and the app is pointed at that
// database before it is imported. Mutation journeys restore what they change
// (create then delete, rename to the same name, reset a completed task), and
// the dataset fingerprint is compared before and after the whole run.
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { openPerfPool } from './perfDatabase.js';
import { summariseDataset } from './perfDataset.js';

const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1]) > 0 && args.includes('--runs')
  ? Number(args[args.indexOf('--runs') + 1])
  : 30;
const WARMUP = 5;
const EXPLAIN = args.includes('--explain');
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

// --- query counting (this process only) -----------------------------------
let recording = null;
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function countedQuery(config, values, callback) {
  if (recording) {
    const text = typeof config === 'string' ? config : config?.text;
    recording.push({ text, values: Array.isArray(values) ? values : config?.values });
  }
  return originalQuery.call(this, config, values, callback);
};

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

async function main() {
  const { pool: perfPool, database } = await openPerfPool();

  // src/config/db.js builds its pool from DATABASE_URL when first imported,
  // so point it at the verified performance database first.
  process.env.DATABASE_URL = process.env.PERF_DATABASE_URL;
  const { pool: appPool } = await import('../../src/config/db.js');
  const { default: app } = await import('../../src/app.js');
  const { rows: [appDb] } = await appPool.query('SELECT current_database() AS db');
  if (appDb.db !== database) {
    throw new Error('Refusing to run: the app is not connected to the performance database');
  }

  const before = await summariseDataset(perfPool);
  const ids = await discoverIds(perfPool);
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const token = (userId, role) => jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const admin = token(ids.adminId, 'admin');
  const developer = token(ids.developerId, 'developer');

  async function call(method, path, auth, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    return { status: res.status, bytes: Buffer.byteLength(text), json: text ? JSON.parse(text) : null };
  }

  const p = ids.projectId;
  const readJourneys = [
    { name: 'Admin dashboard', method: 'GET', path: '/dashboard', auth: admin },
    { name: 'Developer dashboard', method: 'GET', path: '/dashboard', auth: developer },
    { name: 'Responsible projects (Admin nav)', method: 'GET', path: '/projects', auth: admin },
    { name: 'Project members (team view)', method: 'GET', path: `/projects/${p}/members`, auth: admin },
    { name: 'Project board (Admin)', method: 'GET', path: `/projects/${p}/board`, auth: admin },
    { name: 'Project board (Developer)', method: 'GET', path: `/projects/${p}/board`, auth: developer },
    { name: 'Product Backlog', method: 'GET', path: `/projects/${p}/pbis`, auth: admin },
    { name: 'PBI breakdown', method: 'GET', path: `/projects/${p}/pbis/${ids.pbiId}`, auth: developer },
    { name: 'Completed Work History', method: 'GET', path: `/projects/${p}/completed-work`, auth: admin },
    { name: 'Burndown sprint list', method: 'GET', path: `/projects/${p}/sprints`, auth: admin },
    { name: 'Burndown (active sprint)', method: 'GET', path: `/projects/${p}/sprints/${ids.activeSprintId}/burndown`, auth: admin }
  ];

  // Each mutation leaves the dataset as it found it. `prepare` runs before
  // each measured request and is not timed or counted.
  let createdProjectId = null;
  let createdPbiId = null;
  const mutationJourneys = [
    {
      name: 'Create project',
      method: 'POST', path: () => '/projects', auth: admin, body: () => ({ name: 'Perf benchmark project' }),
      after: (r) => { createdProjectId = r.json.project.id; },
      cleanup: () => call('DELETE', `/projects/${createdProjectId}`, admin)
    },
    {
      name: 'Delete empty project',
      method: 'DELETE', auth: admin,
      prepare: async () => { createdProjectId = (await call('POST', '/projects', admin, { name: 'Perf benchmark project' })).json.project.id; },
      path: () => `/projects/${createdProjectId}`
    },
    {
      name: 'Rename project (same name)',
      method: 'PATCH', path: () => `/projects/${p}`, auth: admin, body: () => ({ name: ids.projectName })
    },
    {
      name: 'Create PBI',
      method: 'POST', path: () => `/projects/${p}/pbis`, auth: admin, body: () => ({ title: 'Perf benchmark item' }),
      after: (r) => { createdPbiId = r.json.pbi.id; },
      cleanup: () => call('DELETE', `/projects/${p}/pbis/${createdPbiId}`, admin)
    },
    {
      name: 'Delete PBI',
      method: 'DELETE', auth: admin,
      prepare: async () => { createdPbiId = (await call('POST', `/projects/${p}/pbis`, admin, { title: 'Perf benchmark item' })).json.pbi.id; },
      path: () => `/projects/${p}/pbis/${createdPbiId}`
    },
    {
      name: 'Complete task (with effort)',
      method: 'POST', auth: ids.completable.token,
      prepare: () => resetCompletableTask(perfPool, ids.completable.taskId),
      path: () => `/projects/${ids.completable.projectId}/tasks/${ids.completable.taskId}/complete`,
      body: () => ({ actual_hours: 1.5 })
    }
  ];

  async function measure(journey, kind) {
    const pathOf = typeof journey.path === 'function' ? journey.path : () => journey.path;
    const bodyOf = journey.body ?? (() => undefined);
    const timings = [];
    const queryCounts = [];
    let sample = null;

    for (let i = 0; i < WARMUP + RUNS; i += 1) {
      if (journey.prepare) await journey.prepare();
      const queries = [];
      recording = queries;
      const start = performance.now();
      const result = await call(journey.method, pathOf(), journey.auth, bodyOf());
      const elapsed = performance.now() - start;
      recording = null;

      const expectedOk = result.status >= 200 && result.status < 300;
      if (!expectedOk) {
        throw new Error(`${journey.name} returned ${result.status}: ${result.json?.message ?? ''}`);
      }
      if (journey.after) journey.after(result);
      if (journey.cleanup) {
        recording = null;
        await journey.cleanup();
      }
      if (i >= WARMUP) {
        timings.push(elapsed);
        queryCounts.push(queries.length);
        sample = { status: result.status, bytes: result.bytes, queries };
      }
    }

    const sorted = [...timings].sort((a, b) => a - b);
    return {
      kind,
      journey: journey.name,
      request: `${journey.method} /api${pathOf()}`.replace(/\/\d+(?=\/|$)/g, '/:id'),
      runs: RUNS,
      median_ms: round1(percentile(sorted, 50)),
      p95_ms: round1(percentile(sorted, 95)),
      min_ms: round1(sorted[0]),
      max_ms: round1(sorted[sorted.length - 1]),
      queries: Math.min(...queryCounts) === Math.max(...queryCounts)
        ? queryCounts[0]
        : `${Math.min(...queryCounts)}-${Math.max(...queryCounts)}`,
      response_bytes: sample.bytes,
      sampleQueries: sample.queries
    };
  }

  // Query count vs data size: the same endpoints on the seeded project and on
  // a temporary empty project (created and deleted through the API). A fixed
  // set of queries gives the same count for both; an N+1 pattern would not.
  async function queryCountScaling() {
    const empty = (await call('POST', '/projects', admin, { name: 'Perf scaling check (empty)' })).json.project.id;
    const rows = [];
    try {
      for (const endpoint of ['board', 'completed-work']) {
        for (const [label, projectId] of [['seeded project', p], ['empty project', empty]]) {
          const queries = [];
          recording = queries;
          const result = await call('GET', `/projects/${projectId}/${endpoint}`, admin);
          recording = null;
          const pbis = result.json.pbis ?? [];
          const tasks = pbis.reduce((n, pbi) => n + (pbi.tasks?.length ?? 0), 0);
          const subTasks = pbis.reduce((n, pbi) => n + (pbi.tasks ?? []).reduce((m, t) => m + (t.subTasks?.length ?? 0), 0), 0);
          rows.push({ endpoint: `GET /api/projects/:id/${endpoint}`, project: label, pbis: pbis.length, tasks, subTasks, queries: queries.length });
        }
      }
    } finally {
      await call('DELETE', `/projects/${empty}`, admin);
    }
    return rows;
  }

  const results = [];
  let scaling = [];
  try {
    for (const journey of readJourneys) results.push(await measure(journey, 'read'));
    for (const journey of mutationJourneys) results.push(await measure(journey, 'mutation'));
    await resetCompletableTask(perfPool, ids.completable.taskId);
    scaling = await queryCountScaling();
  } finally {
    server.close();
  }

  console.log(`Performance database "${database}", ${RUNS} measured runs per journey after ${WARMUP} warm-up runs`);
  console.table(results.map(({ sampleQueries, ...row }) => row));
  console.log('Analytics by Project / by Sprint (US-13a/13b): N/A - not implemented at this baseline');
  console.log('\nQueries per request vs data size');
  console.table(scaling);

  let explains = [];
  if (EXPLAIN) {
    explains = await explainReads(perfPool, results.filter((r) => r.kind === 'read'));
  }

  const after = await summariseDataset(perfPool);
  const unchanged = after.fingerprint === before.fingerprint;
  console.log(`Dataset fingerprint before ${before.fingerprint} / after ${after.fingerprint}: ${unchanged ? 'unchanged' : 'CHANGED'}`);

  if (JSON_OUT) {
    await writeFile(JSON_OUT, JSON.stringify({
      database,
      runs: RUNS,
      warmup: WARMUP,
      node: process.version,
      postgres: (await perfPool.query('SHOW server_version')).rows[0].server_version,
      datasetCounts: after.counts,
      fingerprint: after.fingerprint,
      results: results.map(({ sampleQueries, ...row }) => ({ ...row, sql: sampleQueries.map((q) => q.text) })),
      scaling,
      explains
    }, null, 2));
    console.log(`Wrote ${JSON_OUT}`);
  }

  await appPool.end();
  await perfPool.end();
  if (!unchanged) {
    throw new Error('The dataset changed during the benchmark');
  }
}

// Picks the journeys' subjects from the seeded data rather than hard-coding ids.
async function discoverIds(perfPool) {
  const one = async (sql, values = []) => (await perfPool.query(sql, values)).rows[0];
  const project = await one('SELECT id, name, responsible_admin_id FROM projects ORDER BY id LIMIT 1');
  const developer = await one(
    `SELECT pm.user_id FROM project_members pm
      WHERE pm.project_id = $1
      ORDER BY (SELECT count(*) FROM project_members x WHERE x.user_id = pm.user_id) DESC, pm.user_id
      LIMIT 1`,
    [project.id]
  );
  const sprint = await one(`SELECT id FROM sprints WHERE project_id = $1 AND status = 'active'`, [project.id]);
  const pbi = await one(`SELECT id FROM product_backlog_items WHERE project_id = $1 AND stage = 'active_sprint' ORDER BY id LIMIT 1`, [project.id]);
  // An in-progress task in the active sprint whose sub-tasks are all done:
  // the one task the seeded data deliberately leaves ready to complete.
  const task = await one(
    `SELECT t.id, t.assignee_id, pbi.project_id
       FROM tasks t JOIN product_backlog_items pbi ON pbi.id = t.pbi_id
      WHERE pbi.project_id = $1 AND pbi.stage = 'active_sprint' AND t.status = 'in_progress'
        AND NOT EXISTS (SELECT 1 FROM sub_tasks s WHERE s.task_id = t.id AND s.status <> 'done')
      ORDER BY t.id LIMIT 1`,
    [project.id]
  );
  return {
    projectId: project.id,
    projectName: project.name,
    adminId: project.responsible_admin_id,
    developerId: developer.user_id,
    activeSprintId: sprint.id,
    pbiId: pbi.id,
    completable: {
      projectId: task.project_id,
      taskId: task.id,
      token: jwt.sign({ id: task.assignee_id, role: 'developer' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    }
  };
}

// Puts the benchmark's completable task back exactly as the seed left it.
async function resetCompletableTask(perfPool, taskId) {
  await perfPool.query(
    `UPDATE tasks SET status = 'in_progress', actual_hours = NULL, completed_at = NULL WHERE id = $1`,
    [taskId]
  );
}

// EXPLAIN (ANALYZE, BUFFERS) for the exact SELECTs each read journey ran.
// ANALYZE executes the statement, so only plain read statements are allowed.
async function explainReads(perfPool, readResults) {
  const isRead = (sql) => /^\s*(SELECT|WITH)\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(sql);
  const out = [];
  console.log('\nEXPLAIN (ANALYZE, BUFFERS) - scan types per read query');
  for (const result of readResults) {
    for (const query of result.sampleQueries) {
      if (!query.text || !isRead(query.text)) continue;
      const { rows } = await perfPool.query(`EXPLAIN (ANALYZE, BUFFERS) ${query.text}`, query.values);
      const plan = rows.map((r) => r['QUERY PLAN']);
      const scans = plan
        .map((line) => line.match(/(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan|Bitmap Index Scan)( using \S+)? on (\S+)/))
        .filter(Boolean)
        .map((m) => `${m[1]}${m[2] ?? ''} on ${m[3]}`);
      const execution = plan.find((line) => line.startsWith('Execution Time'));
      const firstLine = query.text.replace(/\s+/g, ' ').trim().slice(0, 90);
      out.push({ journey: result.journey, query: firstLine, scans, execution, plan });
      console.log(`- ${result.journey}: ${firstLine}\n    ${execution} | ${[...new Set(scans)].join('; ')}`);
    }
  }
  return out;
}

main().catch((err) => {
  pg.Client.prototype.query = originalQuery;
  console.error(err.message);
  process.exitCode = 1;
});
