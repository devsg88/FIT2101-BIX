// NFR-02 / SCRUM-196. Rebuilds the isolated performance database from scratch
// and fills it with the deterministic dataset in perfDataset.js.
//
//   npm run perf:seed          (from server/, needs PERF_DATABASE_URL)
//
// SAFETY: this script DROPS AND RECREATES the public schema of its target.
// It therefore only runs after openPerfPool() has positively identified the
// target as the separate performance database (see perfDatabase.js). It never
// reads or writes DATABASE_URL's database, and never prints connection details.
//
// Schema setup for a fresh database (see server/db/README.md): schema.sql, then
// migrations/001_task_subtask_assignee_and_status.sql - the one migration whose
// changes (sub-task assignee, task/sub-task status NOT NULL/default/CHECK) are
// not already in schema.sql. The later migrations only re-add what schema.sql
// already creates on a fresh database, so they are not applied here.
//
// Rerunning always produces the same dataset: everything is rebuilt, never
// merged with whatever the database held before.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { openPerfPool } from './perfDatabase.js';
import { buildDataset, expectedCounts, summariseDataset } from './perfDataset.js';

const SCHEMA_FILES = [
  new URL('../../db/schema.sql', import.meta.url),
  new URL('../../db/migrations/001_task_subtask_assignee_and_status.sql', import.meta.url)
];

// Columns/tables the current product (c0a65c7) reads, checked before seeding.
const REQUIRED_COLUMNS = [
  ['projects', 'responsible_admin_id'],
  ['product_backlog_items', 'actual_hours'],
  ['product_backlog_items', 'completed_at'],
  ['tasks', 'actual_hours'],
  ['tasks', 'completed_at'],
  ['tasks', 'description'],
  ['tasks', 'assignee_id'],
  ['sub_tasks', 'description'],
  ['sub_tasks', 'assignee_id'],
  ['pbi_collaborators', 'pbi_id'],
  ['password_reset_tokens', 'token_hash']
];

async function rebuildSchema(client) {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  for (const file of SCHEMA_FILES) {
    await client.query(await readFile(file, 'utf8'));
  }
}

async function verifySchema(client) {
  const missing = [];
  for (const [table, column] of REQUIRED_COLUMNS) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    if (rowCount === 0) missing.push(`${table}.${column}`);
  }
  for (const table of ['tasks', 'sub_tasks']) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM pg_constraint
        WHERE conrelid = $1::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%status%todo%in_progress%done%'`,
      [table]
    );
    if (rowCount === 0) missing.push(`${table}.status CHECK`);
  }
  if (missing.length > 0) {
    throw new Error(`Schema is missing: ${missing.join(', ')}`);
  }
}

// Inserts many rows in one statement with unnest(), one array per column.
async function insertRows(client, table, columns, rows) {
  if (rows.length === 0) return;
  const names = columns.map(([name]) => name);
  const casts = columns.map(([, type], i) => `$${i + 1}::${type}[]`);
  const values = columns.map(([name]) => rows.map((row) => row[name] ?? null));
  await client.query(
    `INSERT INTO ${table} (${names.join(', ')}) SELECT * FROM unnest(${casts.join(', ')})`,
    values
  );
}

// Explicit ids were inserted, so move each identity sequence past them; a
// later insert through the app then gets the next free id.
async function syncIdentitySequences(client) {
  for (const table of ['users', 'teams', 'projects', 'sprints', 'product_backlog_items', 'tasks', 'sub_tasks']) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`
    );
  }
}

async function seed(client, data) {
  // Seeded accounts are for benchmarking with signed tokens, not for logging
  // in: their shared password hash is of a random value that is never kept.
  const unusableHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  const users = data.users.map((user) => ({ ...user, password_hash: unusableHash }));

  await insertRows(client, 'users', [['id', 'bigint'], ['name', 'text'], ['email', 'text'], ['role', 'text'], ['password_hash', 'text']], users);
  await insertRows(client, 'teams', [['id', 'bigint'], ['name', 'text']], data.teams);
  await insertRows(client, 'team_members', [['team_id', 'bigint'], ['user_id', 'bigint']], data.teamMembers);
  await insertRows(client, 'projects', [['id', 'bigint'], ['name', 'text'], ['responsible_admin_id', 'bigint']], data.projects);
  await insertRows(client, 'project_members', [['project_id', 'bigint'], ['user_id', 'bigint']], data.projectMembers);
  await insertRows(
    client,
    'sprints',
    [['id', 'bigint'], ['project_id', 'bigint'], ['name', 'text'], ['status', 'text'], ['started_at', 'timestamptz']],
    data.sprints
  );
  await insertRows(
    client,
    'product_backlog_items',
    [
      ['id', 'bigint'], ['project_id', 'bigint'], ['sprint_id', 'bigint'], ['title', 'text'], ['description', 'text'],
      ['stage', 'text'], ['planned_start_date', 'date'], ['planned_end_date', 'date'],
      ['estimated_hours', 'numeric'], ['actual_hours', 'numeric'], ['completed_at', 'timestamptz']
    ],
    data.pbis
  );
  await insertRows(
    client,
    'tasks',
    [
      ['id', 'bigint'], ['pbi_id', 'bigint'], ['title', 'text'], ['description', 'text'], ['status', 'text'],
      ['assignee_id', 'bigint'], ['actual_hours', 'numeric'], ['completed_at', 'timestamptz']
    ],
    data.tasks
  );
  await insertRows(
    client,
    'sub_tasks',
    [['id', 'bigint'], ['task_id', 'bigint'], ['title', 'text'], ['description', 'text'], ['status', 'text'], ['assignee_id', 'bigint']],
    data.subTasks
  );
  await insertRows(client, 'pbi_collaborators', [['pbi_id', 'bigint'], ['user_id', 'bigint']], data.collaborators);
  await syncIdentitySequences(client);
}

async function main() {
  const { pool, database } = await openPerfPool();
  const started = Date.now();
  const data = buildDataset();
  const client = await pool.connect();

  try {
    console.log(`Rebuilding performance database "${database}"...`);
    await rebuildSchema(client);
    await verifySchema(client);

    await client.query('BEGIN');
    await seed(client, data);
    await client.query('COMMIT');

    // Fresh planner statistics, as autovacuum would eventually collect them,
    // so EXPLAIN on this data reflects normal operation rather than a table
    // PostgreSQL has never looked at.
    await client.query('ANALYZE');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const summary = await summariseDataset(pool);
  await pool.end();

  const expected = expectedCounts(data);
  const mismatches = Object.entries(expected).filter(([table, n]) => summary.counts[table] !== n);
  console.table(summary.counts);
  console.log(`Dataset fingerprint: ${summary.fingerprint}`);
  console.log(`Seeded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (mismatches.length > 0) {
    throw new Error(`Unexpected counts: ${mismatches.map(([t]) => t).join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
