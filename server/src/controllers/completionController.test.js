import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completePbiController } from './completionController.js';
import { getPbiById, getTasksByProject } from '../models/pbiModel.js';
import { completePbi } from '../models/completionModel.js';

vi.mock('../models/pbiModel.js');
vi.mock('../models/completionModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('completePbiController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when required tasks are still open', async () => {
    getPbiById.mockResolvedValue({ id: 3, project_id: 1, stage: 'active_sprint' });
    getTasksByProject.mockResolvedValue([
      { id: 3, pbi_id: 3, status: 'in_progress', actual_hours: null, assignee_id: 1 }
    ]);
    const res = mockRes();

    await completePbiController(
      { params: { projectId: '1', pbiId: '3' }, body: {}, user: { id: 1 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(completePbi).not.toHaveBeenCalled();
  });

  it('sums per-task actual hours and records collaborators', async () => {
    getPbiById.mockResolvedValue({ id: 3, project_id: 1, stage: 'active_sprint' });
    getTasksByProject.mockResolvedValue([
      { id: 3, pbi_id: 3, status: 'done', actual_hours: '4.00', assignee_id: 1 },
      { id: 9, pbi_id: 3, status: 'done', actual_hours: '2.50', assignee_id: 2 },
      { id: 8, pbi_id: 99, status: 'todo', actual_hours: null, assignee_id: 1 }
    ]);
    const completed = {
      pbi: { id: 3, stage: 'completed', actual_hours: '6.50' },
      collaborators: [{ id: 1, name: 'Pang' }]
    };
    completePbi.mockResolvedValue(completed);
    const res = mockRes();

    await completePbiController(
      { params: { projectId: '1', pbiId: '3' }, body: {}, user: { id: 1 } },
      res
    );

    expect(completePbi).toHaveBeenCalledWith(1, 3, 6.5, [1, 2]);
    expect(res.json).toHaveBeenCalledWith(completed);
  });

  it('requires actual hours when the PBI has no tasks', async () => {
    getPbiById.mockResolvedValue({ id: 3, project_id: 1, stage: 'active_sprint' });
    getTasksByProject.mockResolvedValue([]);
    const res = mockRes();

    await completePbiController(
      { params: { projectId: '1', pbiId: '3' }, body: {}, user: { id: 1 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(completePbi).not.toHaveBeenCalled();
  });
});
