import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));
vi.mock('./pbiModel.js');

import { pool } from '../config/db.js';
import { getCompletedWorkByProject } from './completedWorkModel.js';
import { getPbisByStage, getTasksByProject, getSubTasksByProject } from './pbiModel.js';

describe('getCompletedWorkByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('nests tasks and sub-tasks under their completed PBI, carrying actual_hours along', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getPbisByStage.mockResolvedValue([
      { id: 10, stage: 'completed', title: 'User can reset password', actual_hours: '10.50' }
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
