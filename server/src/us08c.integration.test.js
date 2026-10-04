import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from './config/db.js';
import * as tasks from './models/taskModel.js';
import * as subTasks from './models/subTaskModel.js';
import { getBoard, getPbiBreakdown } from './models/boardModel.js';
import { startSprint } from './models/sprintModel.js';

// Opt in with US08C_DB_TEST=1. All work lives in a uniquely named test schema.
describe.skipIf(process.env.US08C_DB_TEST !== '1')('Task breakdown PostgreSQL integration', () => {
  const schema = `us08c_test_${randomUUID().replaceAll('-', '')}`;
  let setupPool;
  let created = false;
  let projectId;
  let otherProjectId;
  let pbiId;
  const fields = { title: 'Build API', description: 'API details' };

  beforeAll(async () => {
    setupPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis:3000 });
    await setupPool.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool.options.options = `-c search_path=${schema}`;
    await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../db/migrations/001_task_subtask_assignee_and_status.sql', import.meta.url), 'utf8'));
    // Exercise the upgrade path as well as the fresh schema, before any fixtures.
    await pool.query('ALTER TABLE tasks DROP COLUMN description; ALTER TABLE sub_tasks DROP COLUMN description');
    const migration = await readFile(new URL('../db/migrations/004_us08c_task_descriptions.sql', import.meta.url), 'utf8');
    await pool.query(migration);
    await pool.query(migration);
  });
  afterAll(async () => {
    await pool.end();
    if (created) await setupPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await setupPool?.end();
  });
  beforeEach(async () => {
    projectId = (await pool.query("INSERT INTO projects (name) VALUES ('Test project') RETURNING id")).rows[0].id;
    otherProjectId = (await pool.query("INSERT INTO projects (name) VALUES ('Other project') RETURNING id")).rows[0].id;
    pbiId = (await pool.query(
      "INSERT INTO product_backlog_items (project_id, title, stage) VALUES ($1, 'Existing PBI', 'sprint_planning') RETURNING id",
      [projectId]
    )).rows[0].id;
  });

  it('creates and edits both levels while preserving ids, parents and completion metadata', async () => {
    const task = await tasks.createTask(projectId, pbiId, fields);
    const sub = await tasks.createSubTask(projectId, task.id, { title: 'Validate', description: null });
    await pool.query("UPDATE tasks SET status = 'in_progress', actual_hours = 2 WHERE id = $1", [task.id]);
    const edited = await tasks.updateTask(projectId, task.id, { title: 'Edited task', description: null });
    const editedSub = await tasks.updateSubTask(projectId, sub.id, { title: 'Edited sub-task', description: 'Checks' });
    expect(edited).toMatchObject({ id: task.id, pbi_id: pbiId, title: 'Edited task', description: null, status: 'in_progress', actual_hours: '2.00' });
    expect(editedSub).toMatchObject({ id: sub.id, task_id: task.id, description: 'Checks' });
    const pbi = await getPbiBreakdown(projectId, pbiId);
    expect(pbi.tasks[0].subTasks[0].id).toBe(sub.id);
    expect((await getBoard(projectId)).pbis).toHaveLength(1);
  });

  it('rejects missing and cross-project parents without inserting children', async () => {
    expect(await tasks.createTask(otherProjectId, pbiId, fields)).toBeNull();
    expect(await tasks.createTask(projectId, '999999', fields)).toBeNull();
    const task = await tasks.createTask(projectId, pbiId, fields);
    expect(await tasks.createSubTask(otherProjectId, task.id, fields)).toBeNull();
    expect(await tasks.createSubTask(projectId, '999999', fields)).toBeNull();
    expect(await tasks.updateTask(otherProjectId, task.id, fields)).toBeNull();
    const sub = await tasks.createSubTask(projectId, task.id, fields);
    expect(await tasks.updateSubTask(otherProjectId, sub.id, fields)).toBeNull();
    expect(await getPbiBreakdown(otherProjectId, pbiId)).toBeNull();
  });

  it('shares created work with admin editing, assignment and deletion without losing descriptions', async () => {
    const user = (await pool.query(
      "INSERT INTO users (name, email, role, password_hash) VALUES ('Developer', $1, 'developer', 'test') RETURNING id",
      [`${randomUUID()}@example.test`]
    )).rows[0];
    const task = await tasks.createTask(projectId, pbiId, fields);
    const sub = await tasks.createSubTask(projectId, task.id, fields);
    expect(await tasks.updateTaskInPbi(otherProjectId, task.id, { title: 'Wrong parent', status: 'todo' })).toBeNull();
    await tasks.updateTaskInPbi(pbiId, task.id, { title: 'Admin task', status: 'in_progress' });
    await subTasks.updateSubTask(task.id, sub.id, { title: 'Admin sub-task', status: 'in_progress' });
    await tasks.assignTask(pbiId, task.id, user.id);
    await subTasks.assignSubTask(task.id, sub.id, user.id);
    await tasks.updateTask(projectId, task.id, { title: 'Planning task', description: 'Revised details' });
    await tasks.updateSubTask(projectId, sub.id, { title: 'Planning sub-task', description: 'Revised sub-task' });
    const nested = (await getPbiBreakdown(projectId, pbiId)).tasks[0];
    expect(nested).toMatchObject({ id: task.id, status: 'in_progress', assignee_id: user.id, description: 'Revised details' });
    expect(nested.subTasks[0]).toMatchObject({ id: sub.id, status: 'in_progress', assignee_id: user.id, description: 'Revised sub-task' });
    expect((await getBoard(projectId)).pbis[0].tasks[0]).toEqual(nested);
    await subTasks.deleteSubTasksByTaskId(task.id);
    expect(await tasks.deleteTask(pbiId, task.id)).toBe(true);
    expect((await getPbiBreakdown(projectId, pbiId)).tasks).toEqual([]);
    expect((await getBoard(projectId)).pbis).toHaveLength(1);
  });

  it('retains the full hierarchy through Start Sprint and Completed history', async () => {
    const task = await tasks.createTask(projectId, pbiId, fields);
    const sub = await tasks.createSubTask(projectId, task.id, fields);
    const second = await tasks.createTask(projectId, pbiId, { title: 'No sub-tasks', description: null });
    const sprint = (await pool.query("INSERT INTO sprints (project_id, name) VALUES ($1, 'Sprint') RETURNING id", [projectId])).rows[0];
    await startSprint(projectId, sprint.id);
    let pbi = await getPbiBreakdown(projectId, pbiId);
    expect(pbi).toMatchObject({ id: pbiId, stage: 'active_sprint', sprint_id: sprint.id });
    expect(pbi.tasks.map((item) => item.id)).toEqual([task.id, second.id]);
    expect(pbi.tasks[0].subTasks[0].id).toBe(sub.id);
    expect(pbi.tasks[1].subTasks).toEqual([]);
    expect(await tasks.createTask(projectId, pbiId, fields)).toBeNull();
    expect(await tasks.updateTask(projectId, task.id, fields)).toBeNull();
    expect(await tasks.createSubTask(projectId, task.id, fields)).toBeNull();
    expect(await tasks.updateSubTask(projectId, sub.id, fields)).toBeNull();
    await tasks.completeSubTask(projectId, sub.id);
    await tasks.completeTask(projectId, task.id, 2);
    await pool.query("UPDATE product_backlog_items SET stage = 'completed' WHERE id = $1", [pbiId]);
    pbi = await getPbiBreakdown(projectId, pbiId);
    expect(pbi.stage).toBe('completed');
    expect(pbi.tasks[0]).toMatchObject({ id: task.id, status: 'done', actual_hours: '2.00' });
    expect(pbi.tasks[0].subTasks[0]).toMatchObject({ id: sub.id, status: 'done' });
  });

  it('rejects a creation that was waiting on a concurrent sprint start', async () => {
    const client = await pool.connect();
    let pending;
    try {
      await client.query('BEGIN');
      await client.query("UPDATE product_backlog_items SET stage = 'active_sprint' WHERE id = $1", [pbiId]);
      pending = tasks.createTask(projectId, pbiId, fields);
      let blocked = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        const { rows } = await setupPool.query(
          "SELECT 1 FROM pg_stat_activity WHERE wait_event = 'transactionid' AND query LIKE '%INSERT INTO tasks%' AND query LIKE '%WITH parent AS%'"
        );
        if (rows.length) { blocked = true; break; }
        await delay(25);
      }
      expect(blocked).toBe(true);
      await client.query('COMMIT');
      expect(await pending).toBeNull();
      expect((await getPbiBreakdown(projectId, pbiId)).tasks).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pending;
    }
  });
});
