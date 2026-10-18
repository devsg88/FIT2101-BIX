import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from './config/db.js';
import { completeTask } from './models/taskModel.js';
import { completePbi } from './models/completionModel.js';
import { getProjectAnalytics, getSprintAnalytics } from './models/analyticsModel.js';

describe.skipIf(process.env.PROJECT_ANALYTICS_DB_TEST !== '1')('Project analytics PostgreSQL integration', () => {
  const schema = `project_analytics_test_${randomUUID().replaceAll('-', '')}`;
  let setupPool;
  let created = false;
  const ids = {};
  const insert = async (sql, values = []) => (await pool.query(`${sql} RETURNING id`, values)).rows[0].id;

  async function pbi(projectId, sprintId = null, stage = 'active_sprint') {
    return insert(`INSERT INTO product_backlog_items(project_id,sprint_id,title,stage,estimated_hours)
      VALUES($1,$2,'Recorded work',$3,999)`, [projectId,sprintId,stage]);
  }

  async function task(pbiId, developerId, hours) {
    const id = await insert("INSERT INTO tasks(pbi_id,title,assignee_id,status) VALUES($1,'Work',$2,'todo')", [pbiId,developerId]);
    const projectId = (await pool.query('SELECT project_id FROM product_backlog_items WHERE id=$1', [pbiId])).rows[0].project_id;
    await completeTask(projectId, id, hours);
    return id;
  }

  beforeAll(async () => {
    setupPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    await setupPool.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool.options.options = `-c search_path=${schema}`;
    await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    for (const [key, role] of [['owner','admin'],['other','admin'],['emptyAdmin','admin'],['alice','developer'],['bob','developer']]) {
      ids[key] = await insert('INSERT INTO users(name,email,role,password_hash) VALUES($1,$2,$3,$4)',
        [role === 'developer' ? 'Same developer name' : key, `${key}@test.example`, role, 'test']);
    }
    ids.a = await insert("INSERT INTO projects(name,responsible_admin_id) VALUES('Same project name',$1)", [ids.owner]);
    ids.b = await insert("INSERT INTO projects(name,responsible_admin_id) VALUES('Same project name',$1)", [ids.owner]);
    ids.empty = await insert("INSERT INTO projects(name,responsible_admin_id) VALUES('Empty',$1)", [ids.owner]);
    ids.private = await insert("INSERT INTO projects(name,responsible_admin_id) VALUES('Private',$1)", [ids.other]);
    ids.unowned = await insert("INSERT INTO projects(name) VALUES('Unowned')");
    ids.sprint1 = await insert("INSERT INTO sprints(project_id,name) VALUES($1,'Sprint 1')", [ids.a]);
    ids.sprint2 = await insert("INSERT INTO sprints(project_id,name) VALUES($1,'Sprint 2')", [ids.a]);
    const first = await pbi(ids.a, ids.sprint1);
    const firstTask = await task(first, ids.alice, 2.25);
    await task(first, ids.bob, 1.5);
    await pool.query("INSERT INTO sub_tasks(task_id,title,status) VALUES($1,'Check 1','done'),($1,'Check 2','done')", [firstTask]);
    await completePbi(ids.a, first, 3.75, [ids.alice,ids.bob,ids.owner]);
    await task(await pbi(ids.a, ids.sprint2), ids.alice, 3.75);
    await task(await pbi(ids.a), ids.alice, 0.5);
    const second = await pbi(ids.b);
    await task(second, ids.alice, 4);
    await task(second, ids.bob, 2.25);
    await task(second, ids.bob, 0.75);
    await pool.query(`INSERT INTO tasks(pbi_id,title,status,assignee_id,actual_hours) VALUES
      ($1,'Missing','done',$2,NULL),($1,'Unassigned','done',NULL,1.25),
      ($1,'Admin work','done',$3,2),($1,'Not done','in_progress',$2,99)`, [second,ids.bob,ids.owner]);
    const taskless = await pbi(ids.b);
    await completePbi(ids.b, taskless, 5.5, [ids.alice,ids.bob]);
    await pool.query("INSERT INTO product_backlog_items(project_id,title,stage) VALUES($1,'Missing PBI hours','completed')", [ids.b]);
    await task(await pbi(ids.a, null, 'sprint_planning'), ids.alice, 17);
    await task(await pbi(ids.private), ids.alice, 77);
    const privateTaskless = await pbi(ids.private);
    await completePbi(ids.private, privateTaskless, 23, [ids.alice]);
    await task(await pbi(ids.unowned), ids.alice, 88);
  }, 10000);

  afterAll(async () => {
    await pool.end();
    if (created) await setupPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await setupPool?.end();
  });

  it('totals completion-recorded Actual Hours across Sprints and without a Sprint, not estimates or rollups', async () => {
    const data = await getProjectAnalytics(ids.owner);
    const hours = (project, developer) => data.effort.find((point) => point.project_id === project && point.developer_id === developer).actual_hours;
    expect(hours(ids.a,ids.alice)).toBe(6.5);
    expect(hours(ids.a,ids.bob)).toBe(1.5);
    expect(hours(ids.b,ids.alice)).toBe(4);
    expect(hours(ids.b,ids.bob)).toBe(3);
    expect(data.effort.reduce((sum, point) => sum + point.actual_hours, 0)).toBe(15);
  });

  it('keeps duplicate names distinct and includes responsible projects without work', async () => {
    const data = await getProjectAnalytics(ids.owner);
    expect(data.projects.map((project) => project.id)).toEqual([ids.a,ids.b,ids.empty]);
    expect(data.developers.map((developer) => developer.id).sort()).toEqual([ids.alice,ids.bob].sort());
  });

  it('retains incomplete recordings and unallocated hours without inventing a collaborator split', async () => {
    const data = await getProjectAnalytics(ids.owner);
    expect(data.effort.find((point) => point.project_id === ids.b && point.developer_id === ids.bob).missing_actual_hours).toBe(1);
    expect(data.unattributed).toEqual([{ project_id: ids.b, actual_hours: 8.75, recorded_items: 3, missing_actual_hours: 1 }]);
  });

  it('isolates each admin, omitting private and unowned project metadata and hours', async () => {
    const data = await getProjectAnalytics(ids.other);
    expect(data.projects.map((project) => project.id)).toEqual([ids.private]);
    expect(data.effort.map((point) => point.actual_hours)).toEqual([77]);
    expect(data.unattributed[0].actual_hours).toBe(23);
    expect(await getProjectAnalytics(ids.emptyAdmin)).toEqual({ projects: [], developers: [], effort: [], unattributed: [] });
  });

  it('preserves the existing Sprint contract and its no-Sprint handling', async () => {
    const data = await getSprintAnalytics(ids.a);
    expect(data.sprints.map((sprint) => sprint.id)).toEqual([ids.sprint1,ids.sprint2]);
    expect(data.effort.reduce((sum, point) => sum + point.actual_hours, 0)).toBe(7.5);
    expect(data.unattributed).toEqual([{ sprint_id: null, actual_hours: 0.5, recorded_items: 1, missing_actual_hours: 0 }]);
  });
});
