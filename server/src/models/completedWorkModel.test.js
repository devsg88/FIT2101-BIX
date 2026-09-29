import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));
vi.mock('./pbiModel.js');
vi.mock('./sprintModel.js');

import { pool } from '../config/db.js';
import { getCompletedWorkByProject } from './completedWorkModel.js';
import { getPbisByStage, getTasksByProject, getSubTasksByProject } from './pbiModel.js';
import { getSprintsByProject } from './sprintModel.js';

describe('getCompletedWorkByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every test gets an empty sprint list by default; tests that care about
    // sprint_name override this explicitly.
    getSprintsByProject.mockResolvedValue([]);
  });

  it('returns null when the project does not exist', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    getPbisByStage.mockResolvedValue([]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    const result = await getCompletedWorkByProject(1);

    expect(result).toBeNull();
  });

  it('queries only the completed stage for this project', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getPbisByStage.mockResolvedValue([]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    await getCompletedWorkByProject(1);

    expect(getPbisByStage).toHaveBeenCalledWith(1, 'completed');
  });

  it('nests tasks and sub-tasks under their completed PBI, carrying actual_hours and sprint_name along', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getSprintsByProject.mockResolvedValue([{ id: 1, name: 'Sprint 1' }]);
    getPbisByStage.mockResolvedValue([
      {
        id: 10,
        stage: 'completed',
        title: 'User can reset password',
        actual_hours: '10.50',
        sprint_id: 1
      }
    ]);
    getTasksByProject.mockResolvedValue([
      { id: 100, pbi_id: 10, title: 'Build reset endpoint', status: 'done' }
    ]);
    getSubTasksByProject.mockResolvedValue([
      { id: 1000, task_id: 100, title: 'Write validation tests', status: 'done' }
    ]);

    const result = await getCompletedWorkByProject(1);

    expect(result.project).toEqual({ id: 1, name: 'BIX Platform' });
    expect(result.pbis).toEqual([
      {
        id: 10,
        stage: 'completed',
        title: 'User can reset password',
        actual_hours: '10.50',
        sprint_id: 1,
        sprint_name: 'Sprint 1',
        tasks: [
          {
            id: 100,
            pbi_id: 10,
            title: 'Build reset endpoint',
            status: 'done',
            subTasks: [
              { id: 1000, task_id: 100, title: 'Write validation tests', status: 'done' }
            ]
          }
        ]
      }
    ]);
  });

  it('matches sprint_name by sprint_id even when the database returns bigint columns as strings', async () => {
    // node-pg returns bigint columns (ids) as strings, not numbers. This
    // proves the lookup still works when sprint_id and sprints.id disagree
    // in type (one string, one number) the way a real query result could.
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getSprintsByProject.mockResolvedValue([{ id: '3', name: 'Sprint 3' }]);
    getPbisByStage.mockResolvedValue([
      { id: 10, stage: 'completed', title: 'Login page', sprint_id: 3 }
    ]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    const result = await getCompletedWorkByProject(1);

    expect(result.pbis[0].sprint_name).toBe('Sprint 3');
  });

  it('returns sprint_name null for a completed PBI with no matching sprint', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getSprintsByProject.mockResolvedValue([{ id: 1, name: 'Sprint 1' }]);
    getPbisByStage.mockResolvedValue([
      { id: 10, stage: 'completed', title: 'Orphaned PBI', sprint_id: null }
    ]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    const result = await getCompletedWorkByProject(1);

    expect(result.pbis[0].sprint_name).toBeNull();
  });

  it('requests every underlying query with the exact requested projectId, never a different one', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 5, name: 'Mobile App' }] });
    getPbisByStage.mockResolvedValue([]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    await getCompletedWorkByProject(5);

    // getProjectById (boardModel.js) is the one call that still goes through
    // the raw pool mock; the other three are asserted directly. Together
    // these are every source of PBI/task/sub-task data this function reads,
    // so this proves the whole result is scoped to project 5, not leaked in
    // from any other project.
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [5]);
    expect(getPbisByStage).toHaveBeenCalledWith(5, 'completed');
    expect(getTasksByProject).toHaveBeenCalledWith(5);
    expect(getSubTasksByProject).toHaveBeenCalledWith(5);
  });

  it('passes actual_hours through exactly as US-11 recorded it, including leaving it null rather than defaulting it', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getPbisByStage.mockResolvedValue([
      { id: 10, stage: 'completed', title: 'Has recorded hours', actual_hours: '10.50' },
      { id: 11, stage: 'completed', title: 'Not recorded yet', actual_hours: null }
    ]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    const result = await getCompletedWorkByProject(1);

    // Exact string preserved (not re-parsed/rounded) for the recorded one,
    // and null stays null (not coerced to 0 or omitted) for the other - this
    // function must never invent completion data US-11 did not actually save.
    expect(result.pbis.find((pbi) => pbi.id === 10).actual_hours).toBe('10.50');
    expect(result.pbis.find((pbi) => pbi.id === 11).actual_hours).toBeNull();
  });

  it('excludes tasks and sub-tasks belonging to a PBI that is not completed', async () => {
    // getTasksByProject/getSubTasksByProject return every task/sub-task in
    // the whole project (same as boardModel.getBoard), so a task hanging off
    // a PBI still in an earlier stage must be filtered out here rather than
    // leaking into the completed-work history.
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getPbisByStage.mockResolvedValue([{ id: 10, stage: 'completed', title: 'Completed PBI' }]);
    getTasksByProject.mockResolvedValue([
      { id: 100, pbi_id: 10, title: 'Task on completed PBI' },
      { id: 101, pbi_id: 11, title: 'Task on an in-progress PBI' }
    ]);
    getSubTasksByProject.mockResolvedValue([
      { id: 1000, task_id: 100, title: 'Sub-task on completed task' },
      { id: 1001, task_id: 101, title: 'Sub-task on in-progress task' }
    ]);

    const result = await getCompletedWorkByProject(1);

    expect(result.pbis).toHaveLength(1);
    expect(result.pbis[0].tasks).toEqual([
      {
        id: 100,
        pbi_id: 10,
        title: 'Task on completed PBI',
        subTasks: [{ id: 1000, task_id: 100, title: 'Sub-task on completed task' }]
      }
    ]);
  });

  it('returns an empty pbis list when nothing has been completed yet', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getPbisByStage.mockResolvedValue([]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    const result = await getCompletedWorkByProject(1);

    expect(result).toEqual({ project: { id: 1, name: 'BIX Platform' }, pbis: [] });
  });
});
