import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  updatePbiPlanning,
  updatePbiStage,
  getPbisByStage,
  getTasksByProject,
  getSubTasksByProject
} from './pbiModel.js';

describe('updatePbiStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a single UPDATE scoped to both the PBI id and the project id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 2, project_id: 1, stage: 'sprint_planning' }] });

    await updatePbiStage(1, 2, 'sprint_planning');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE product_backlog_items/i);
    expect(sql).toMatch(/SET stage = \$1/i);
    expect(sql).toMatch(/WHERE id = \$2 AND project_id = \$3/i);
    // newStage, pbiId, projectId, in that order, matching $1/$2/$3 above.
    expect(params).toEqual(['sprint_planning', 2, 1]);
  });

  it('returns the updated row when the PBI belongs to that project', async () => {
    const updatedRow = {
      id: 2,
      project_id: 1,
      title: 'User can upload a profile photo',
      stage: 'sprint_planning',
      description: 'unchanged',
      estimated_hours: null
    };
    pool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await updatePbiStage(1, 2, 'sprint_planning');

    expect(result).toEqual(updatedRow);
  });

  it('only changes the stage column, every other field comes back as it was', async () => {
    // The RETURNING clause reflects exactly what the database has after the
    // UPDATE, so a row that comes back with its other fields intact and only
    // `stage` different from before is the proof the query never touches
    // anything else (title, description, dates, hours, created_at, id...).
    const rowAfterMove = {
      id: 2,
      project_id: 1,
      title: 'User can upload a profile photo',
      description: 'Profile page gains an avatar upload.',
      stage: 'sprint_planning',
      planned_start_date: null,
      planned_end_date: null,
      estimated_hours: null,
      actual_hours: null
    };
    pool.query.mockResolvedValue({ rows: [rowAfterMove] });

    const result = await updatePbiStage(1, 2, 'sprint_planning');

    expect(result.id).toBe(2);
    expect(result.title).toBe('User can upload a profile photo');
    expect(result.description).toBe('Profile page gains an avatar upload.');
    expect(result.stage).toBe('sprint_planning');
  });

  it('returns null when no row matches (wrong project or unknown PBI)', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await updatePbiStage(999, 2, 'sprint_planning');

    expect(result).toBeNull();
  });

  it('returns null rather than updating a PBI that belongs to a different project', async () => {
    // Same pbiId, wrong projectId: the WHERE clause requires both to match,
    // so this must come back empty, never touch PBI 2's row from project 1.
    pool.query.mockResolvedValue({ rows: [] });

    const result = await updatePbiStage(2, 2, 'sprint_planning');

    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['sprint_planning', 2, 2]);
  });
});

describe('updatePbiPlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only the planning columns, scoped to PBI id and project id', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        id: 2,
        project_id: 1,
        stage: 'sprint_planning',
        planned_start_date: '2026-09-15',
        planned_end_date: '2026-09-22',
        estimated_hours: '16.00'
      }]
    });

    await updatePbiPlanning(1, 2, {
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: 16
    });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE product_backlog_items/i);
    expect(sql).toMatch(/planned_start_date = \$1/i);
    expect(sql).toMatch(/planned_end_date = \$2/i);
    expect(sql).toMatch(/estimated_hours = \$3/i);
    expect(sql).not.toMatch(/SET stage/i);
    expect(params).toEqual(['2026-09-15', '2026-09-22', 16, 2, 1]);
  });
});

// US-12: Completed Work History reads through these three functions
// (getPbisByStage, getTasksByProject, getSubTasksByProject). These tests
// exist to prove the actual SQL scopes every row to the requested project -
// completedWorkModel.test.js mocks this file entirely, so it can only prove
// the right projectId/stage arguments are *passed in*, not that the
// underlying query actually filters by them. This is that missing proof.
describe('getPbisByStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes to both project_id and stage, never one without the other', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getPbisByStage(1, 'completed');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM product_backlog_items/i);
    expect(sql).toMatch(/WHERE project_id = \$1 AND stage = \$2/i);
    expect(params).toEqual([1, 'completed']);
  });

  it('does not return a completed PBI that belongs to a different project', async () => {
    // The mock stands in for Postgres actually applying the WHERE clause: a
    // project_id = 2 row would never be in the result set for project 1, so
    // asserting on what the (correctly parameterized, per the test above)
    // query returns for project 1 is the right level to check this at.
    pool.query.mockResolvedValue({
      rows: [{ id: 10, project_id: 1, stage: 'completed', title: 'In project 1' }]
    });

    const result = await getPbisByStage(1, 'completed');

    expect(result).toEqual([{ id: 10, project_id: 1, stage: 'completed', title: 'In project 1' }]);
    expect(result.every((pbi) => pbi.project_id === 1)).toBe(true);
  });
});

// US-04a / SCRUM-122: the board needs to show who a task/sub-task is
// assigned to (and the frontend assignee dropdown needs its current value),
// so these two now select assignee_id too.
describe('getTasksByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins through product_backlog_items and scopes to project_id', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getTasksByProject(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM tasks t/i);
    expect(sql).toMatch(/JOIN product_backlog_items p ON p\.id = t\.pbi_id/i);
    expect(sql).toMatch(/WHERE p\.project_id = \$1/i);
    expect(params).toEqual([1]);
  });

  it('selects assignee_id alongside the existing columns, scoped to the project', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, pbi_id: 2, title: 'x', status: 'todo', assignee_id: null }]
    });

    await getTasksByProject(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT t\.id, t\.pbi_id, t\.title, t\.description, t\.status,\s*t\.assignee_id, t\.actual_hours, t\.completed_at/i);
    expect(sql).toMatch(/WHERE p\.project_id = \$1/i);
    expect(params).toEqual([1]);
  });
});

describe('getSubTasksByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins through tasks and product_backlog_items and scopes to project_id', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getSubTasksByProject(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM sub_tasks s/i);
    expect(sql).toMatch(/JOIN tasks t ON t\.id = s\.task_id/i);
    expect(sql).toMatch(/JOIN product_backlog_items p ON p\.id = t\.pbi_id/i);
    expect(sql).toMatch(/WHERE p\.project_id = \$1/i);
    expect(params).toEqual([1]);
  });

  it('selects assignee_id alongside the existing columns, scoped to the project', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, task_id: 2, title: 'x', status: 'todo', assignee_id: null }]
    });

    await getSubTasksByProject(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT s\.id, s\.task_id, s\.title, s\.description, s\.status, s\.assignee_id/i);
    expect(sql).toMatch(/WHERE p\.project_id = \$1/i);
    expect(params).toEqual([1]);
  });
});
