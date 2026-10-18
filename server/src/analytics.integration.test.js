import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from './config/db.js';
import { completeTask } from './models/taskModel.js';
import { completePbi } from './models/completionModel.js';
import { getSprintAnalytics } from './models/analyticsModel.js';

describe.skipIf(process.env.SPRINT_ANALYTICS_DB_TEST !== '1')('Sprint analytics PostgreSQL integration', () => {
  const schema = `analytics_test_${randomUUID().replaceAll('-', '')}`;
  let setupPool;
  let created = false;
  let projectId;
  let emptyProjectId;
  let firstSprint;
  let secondSprint;
  let emptySprint;
  let firstDeveloper;
  let secondDeveloper;

  async function insert(sql, params = []) {
    return (await pool.query(`${sql} RETURNING id`, params)).rows[0].id;
  }

  beforeAll(async () => {
    setupPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    await setupPool.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool.options.options = `-c search_path=${schema}`;
    await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    const admin = await insert("INSERT INTO users (name, email, role, password_hash) VALUES ('Admin', 'admin@test', 'admin', 'test')");
    firstDeveloper = await insert("INSERT INTO users (name, email, role, password_hash) VALUES ('Alex', 'alex1@test', 'developer', 'test')");
    secondDeveloper = await insert("INSERT INTO users (name, email, role, password_hash) VALUES ('Alex', 'alex2@test', 'developer', 'test')");
    projectId = await insert("INSERT INTO projects (name) VALUES ('Analytics project')");
    emptyProjectId = await insert("INSERT INTO projects (name) VALUES ('Other project')");
    firstSprint = await insert("INSERT INTO sprints (project_id, name, status) VALUES ($1, 'Iteration', 'completed')", [projectId]);
    secondSprint = await insert("INSERT INTO sprints (project_id, name, status) VALUES ($1, 'Iteration', 'active')", [projectId]);
    emptySprint = await insert("INSERT INTO sprints (project_id, name) VALUES ($1, 'Future')", [projectId]);
    const pbi = await insert(`INSERT INTO product_backlog_items (project_id, sprint_id, title, stage, estimated_hours)
      VALUES ($1, $2, 'Completed work', 'active_sprint', 999)`, [projectId, firstSprint]);
    const task = await insert("INSERT INTO tasks (pbi_id, title, assignee_id) VALUES ($1, 'First', $2)", [pbi, firstDeveloper]);
    const another = await insert("INSERT INTO tasks (pbi_id, title, assignee_id) VALUES ($1, 'Second', $2)", [pbi, firstDeveloper]);
    const otherDeveloperTask = await insert("INSERT INTO tasks (pbi_id, title, assignee_id) VALUES ($1, 'Third', $2)", [pbi, secondDeveloper]);
    await pool.query("INSERT INTO sub_tasks (task_id, title, status) VALUES ($1, 'Sub 1', 'done'), ($1, 'Sub 2', 'done')", [task]);
    await completeTask(projectId, task, 2.25);
    await completeTask(projectId, another, 1.5);
    await completeTask(projectId, otherDeveloperTask, 4);
    await completePbi(projectId, pbi, 7.75, [admin, firstDeveloper, secondDeveloper]);

    const activePbi = await insert(`INSERT INTO product_backlog_items (project_id, sprint_id, title, stage)
      VALUES ($1, $2, 'Active work', 'active_sprint')`, [projectId, secondSprint]);
    const activeTask = await insert("INSERT INTO tasks (pbi_id, title, assignee_id) VALUES ($1, 'Finished task', $2)", [activePbi, firstDeveloper]);
    await completeTask(projectId, activeTask, 5);
    await pool.query(`INSERT INTO tasks (pbi_id, title, assignee_id, status, actual_hours) VALUES
      ($1, 'Not done', $2, 'in_progress', 12), ($1, 'Legacy missing hours', $3, 'done', NULL),
      ($1, 'Unassigned', NULL, 'done', 1.75), ($1, 'Admin work', $4, 'done', 2.25)`,
    [activePbi, firstDeveloper, secondDeveloper, admin]);
    const taskless = await insert(`INSERT INTO product_backlog_items (project_id, sprint_id, title, stage)
      VALUES ($1, $2, 'No Tasks', 'active_sprint')`, [projectId, secondSprint]);
    await completePbi(projectId, taskless, 6.5, [firstDeveloper, secondDeveloper]);
    await pool.query(`INSERT INTO product_backlog_items (project_id, sprint_id, title, stage, actual_hours) VALUES
      ($1, $2, 'Missing PBI hours', 'completed', NULL), ($1, NULL, 'No Sprint', 'completed', 2.5)`, [projectId, secondSprint]);
    const planning = await insert(`INSERT INTO product_backlog_items (project_id, title, stage)
      VALUES ($1, 'Planning', 'sprint_planning')`, [projectId]);
    await pool.query("INSERT INTO tasks (pbi_id, title, assignee_id, status, actual_hours) VALUES ($1, 'Not completed work', $2, 'done', 9)", [planning, firstDeveloper]);
  }, 10000);

  afterAll(async () => {
    await pool.end();
    if (created) await setupPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await setupPool?.end();
  });

  it('sums completion-recorded Task hours once, ignoring estimates, parent rollups, collaborators and subtasks', async () => {
    const data = await getSprintAnalytics(projectId);
    expect(data.effort.find((point) => point.sprint_id === firstSprint && point.developer_id === firstDeveloper))
      .toMatchObject({ actual_hours: 3.75, recorded_items: 2 });
    expect(data.effort.find((point) => point.sprint_id === firstSprint && point.developer_id === secondDeveloper))
      .toMatchObject({ actual_hours: 4, recorded_items: 1 });
    expect(data.effort.reduce((sum, point) => sum + point.actual_hours, 0)).toBe(12.75);
  });

  it('distinguishes duplicate names, includes empty Sprints and completed Tasks in an active Sprint', async () => {
    const data = await getSprintAnalytics(projectId);
    expect(data.sprints.map((sprint) => sprint.id)).toEqual([firstSprint, secondSprint, emptySprint]);
    expect(data.developers).toHaveLength(2);
    expect(data.effort.find((point) => point.sprint_id === secondSprint && point.developer_id === firstDeveloper))
      .toMatchObject({ actual_hours: 5, recorded_items: 1 });
  });

  it('reports missing records and task-less PBI totals without assigning them arbitrarily', async () => {
    const data = await getSprintAnalytics(projectId);
    expect(data.effort.find((point) => point.sprint_id === secondSprint && point.developer_id === secondDeveloper))
      .toMatchObject({ actual_hours: 0, recorded_items: 0, missing_actual_hours: 1 });
    expect(data.unattributed).toEqual(expect.arrayContaining([
      { sprint_id: secondSprint, actual_hours: 10.5, recorded_items: 3, missing_actual_hours: 1 },
      { sprint_id: null, actual_hours: 2.5, recorded_items: 1, missing_actual_hours: 0 }
    ]));
  });

  it('does not return another project\'s work', async () => {
    expect(await getSprintAnalytics(emptyProjectId)).toEqual({ sprints: [], developers: [], effort: [], unattributed: [] });
  });
});
