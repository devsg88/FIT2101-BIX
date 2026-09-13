import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startSprintController } from './sprintController.js';
import { getPbisByStage } from '../models/pbiModel.js';
import { getSprintById, startSprint } from '../models/sprintModel.js';

vi.mock('../models/pbiModel.js');
vi.mock('../models/sprintModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1', sprintId = '3' } = {}) {
  return { params: { projectId, sprintId } };
}

const plannedPbi = {
  id: 2,
  project_id: 1,
  stage: 'sprint_planning',
  planned_start_date: '2026-09-15',
  planned_end_date: '2026-09-22',
  estimated_hours: '16.00'
};

describe('startSprintController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await startSprintController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getSprintById).not.toHaveBeenCalled();
  });

  it('returns 404 when the sprint does not exist in that project', async () => {
    getSprintById.mockResolvedValue(null);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(getSprintById).toHaveBeenCalledWith(1, 3);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('returns 400 when the sprint is not still in planning', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'active' });
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('returns 400 when there are no PBIs in Sprint Planning', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'planning' });
    getPbisByStage.mockResolvedValue([]);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Cannot start an empty sprint' });
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('returns 400 when a planning PBI is still missing estimate or dates', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'planning' });
    getPbisByStage.mockResolvedValue([
      { id: 2, stage: 'sprint_planning', estimated_hours: null, planned_start_date: null, planned_end_date: null }
    ]);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(startSprint).not.toHaveBeenCalled();
  });

  it('starts the sprint and returns the updated sprint and PBIs', async () => {
    getSprintById.mockResolvedValue({ id: 3, project_id: 1, status: 'planning' });
    getPbisByStage.mockResolvedValue([plannedPbi]);
    const started = {
      sprint: { id: 3, status: 'active' },
      pbis: [{ ...plannedPbi, stage: 'active_sprint', sprint_id: 3 }]
    };
    startSprint.mockResolvedValue(started);
    const res = mockRes();

    await startSprintController(mockReq(), res);

    expect(startSprint).toHaveBeenCalledWith(1, 3);
    expect(res.json).toHaveBeenCalledWith(started);
  });
});
