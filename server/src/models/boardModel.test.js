import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));
vi.mock('./pbiModel.js');
vi.mock('./sprintModel.js');

import { pool } from '../config/db.js';
import { getBoard } from './boardModel.js';
import {
  getPbisByProject,
  getTasksByProject,
  getSubTasksByProject
} from './pbiModel.js';
import { getSprintsByProject } from './sprintModel.js';

describe('getBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the project does not exist', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    getSprintsByProject.mockResolvedValue([]);
    getPbisByProject.mockResolvedValue([]);
    getTasksByProject.mockResolvedValue([]);
    getSubTasksByProject.mockResolvedValue([]);

    const result = await getBoard(1);

    expect(result).toBeNull();
  });

  it('nests tasks under PBIs and sub-tasks under tasks, scoped to the project', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'BIX Platform' }] });
    getSprintsByProject.mockResolvedValue([{ id: 3, name: 'Sprint 3' }]);
    getPbisByProject.mockResolvedValue([
      { id: 10, stage: 'sprint_planning' },
      { id: 11, stage: 'product_backlog' }
    ]);
    getTasksByProject.mockResolvedValue([
      { id: 100, pbi_id: 10, title: 'API endpoint' }
    ]);
    getSubTasksByProject.mockResolvedValue([
      { id: 1000, task_id: 100, title: 'Validate file size' }
    ]);

    const result = await getBoard(1);

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [1]);
    expect(getSprintsByProject).toHaveBeenCalledWith(1);
    expect(result.project).toEqual({ id: 1, name: 'BIX Platform' });
    expect(result.pbis).toEqual([
      {
        id: 10,
        stage: 'sprint_planning',
        tasks: [
          {
            id: 100,
            pbi_id: 10,
            title: 'API endpoint',
            subTasks: [{ id: 1000, task_id: 100, title: 'Validate file size' }]
          }
        ]
      },
      { id: 11, stage: 'product_backlog', tasks: [] }
    ]);
  });
});
