import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/burndownModel.js', () => ({
  getBurndownData: vi.fn()
}));

vi.mock('../models/sprintModel.js', () => ({
  getSprintsByProject: vi.fn()
}));

import { getBurndownData } from '../models/burndownModel.js';
import { getSprintsByProject } from '../models/sprintModel.js';
import {
  getBurndownController,
  getProjectSprintsController
} from './burndownController.js';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('getBurndownController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([['abc'], ['0'], ['-1'], ['1.5']])('returns 400 for projectId %s', async (projectId) => {
    const res = mockRes();

    await getBurndownController({ params: { projectId, sprintId: '2' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid sprintId', async () => {
    const res = mockRes();

    await getBurndownController({ params: { projectId: '1', sprintId: 'x' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A valid sprintId is required' });
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('returns 404 when the Sprint is not in this project', async () => {
    getBurndownData.mockResolvedValue(null);
    const res = mockRes();

    await getBurndownController({ params: { projectId: '1', sprintId: '99' } }, res);

    expect(getBurndownData).toHaveBeenCalledWith(1, 99);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Sprint not found' });
  });

  it('responds with the burndown built from the Sprint and its items', async () => {
    getBurndownData.mockResolvedValue({
      sprint: { id: 3, name: 'Sprint 3', status: 'planning', started_at: null },
      pbis: [{ stage: 'sprint_planning', estimated_hours: '5.00', planned_end_date: null }]
    });
    const res = mockRes();

    await getBurndownController({ params: { projectId: '1', sprintId: '3' } }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      sprint: { id: 3, name: 'Sprint 3', status: 'planning', startDate: null, endDate: null },
      totalPoints: 5,
      remainingPoints: 5,
      series: [],
      emptyReason: 'not_started'
    });
  });

  it('returns 500 with a plain message when loading fails', async () => {
    getBurndownData.mockRejectedValue(new Error('connection refused at 10.0.0.1'));
    const res = mockRes();

    await getBurndownController({ params: { projectId: '1', sprintId: '2' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load the burndown chart' });
  });
});

describe('getProjectSprintsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for an invalid projectId', async () => {
    const res = mockRes();

    await getProjectSprintsController({ params: { projectId: 'nope' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getSprintsByProject).not.toHaveBeenCalled();
  });

  it('responds with the project\'s Sprints', async () => {
    const sprints = [{ id: 1, name: 'Sprint 1', status: 'completed' }];
    getSprintsByProject.mockResolvedValue(sprints);
    const res = mockRes();

    await getProjectSprintsController({ params: { projectId: '1' } }, res);

    expect(getSprintsByProject).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ sprints });
  });

  it('returns 500 with a plain message when loading fails', async () => {
    getSprintsByProject.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await getProjectSprintsController({ params: { projectId: '1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load the Sprints' });
  });
});
