import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));
vi.mock('./pbiModel.js');
vi.mock('./sprintModel.js');
vi.mock('./taskModel.js');

import { pool } from '../config/db.js';
import { getBoard, getPbiBreakdown, getProjectById } from './boardModel.js';
import { getPbiById } from './pbiModel.js';
import { getTasksByPbi, getSubTasksByPbi } from './taskModel.js';
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

describe('getPbiBreakdown', () => {
  beforeEach(() => vi.resetAllMocks());
  it('nests multiple tasks, optional sub-tasks and descriptions without duplicating the PBI', async () => {
    getPbiById.mockResolvedValue({ id: '10', project_id: '7', stage: 'active_sprint' });
    getTasksByPbi.mockResolvedValue([
      { id: '11', pbi_id: '10', description: 'Details' },
      { id: '12', pbi_id: '10' }
    ]);
    getSubTasksByPbi.mockResolvedValue([{ id: '13', task_id: '11', description: 'Nested' }]);
    const pbi = await getPbiBreakdown(7, 10);
    expect(pbi.id).toBe('10');
    expect(pbi.tasks).toEqual([
      { id: '11', pbi_id: '10', description: 'Details', subTasks: [{ id: '13', task_id: '11', description: 'Nested' }] },
      { id: '12', pbi_id: '10', subTasks: [] }
    ]);
    expect(getTasksByPbi).toHaveBeenCalledWith(7, 10);
    expect(getSubTasksByPbi).toHaveBeenCalledWith(7, 10);
  });
  it('does not load children of a missing or cross-project PBI', async () => {
    getPbiById.mockResolvedValue(null);
    expect(await getPbiBreakdown(7, 10)).toBeNull();
    expect(getTasksByPbi).not.toHaveBeenCalled();
  });
});

// US-07 / SCRUM-199
describe('getProjectById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the project with its current focus PBI id for the board', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: '1', name: 'BIX Platform', current_focus_pbi_id: '7' }]
    });

    const project = await getProjectById(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT id, name, current_focus_pbi_id FROM projects WHERE id = \$1/);
    expect(params).toEqual([1]);
    expect(project).toEqual({ id: '1', name: 'BIX Platform', current_focus_pbi_id: '7' });
  });

  it('returns null when the project does not exist', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await getProjectById(999)).toBeNull();
  });
});
