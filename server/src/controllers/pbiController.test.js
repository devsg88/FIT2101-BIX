import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  moveStageController,
  updatePlanningController
} from './pbiController.js';
import { getPbiById, updatePbiPlanning, updatePbiStage } from '../models/pbiModel.js';

// Replace the real database-backed model with a fake one we control per test.
// checkStageTransition is NOT mocked, the real workflow rules from
// ../constants/stageTransitions.js run in these tests too.
vi.mock('../models/pbiModel.js');

// A small fake Express response object we can inspect after calling the controller.
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1', pbiId = '2', stage = 'sprint_planning' } = {}) {
  return { params: { projectId, pbiId }, body: { stage } };
}

describe('moveStageController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await moveStageController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when pbiId is not a positive integer', async () => {
    const res = mockRes();

    await moveStageController(mockReq({ pbiId: '0' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 400 when no target stage is given', async () => {
    const res = mockRes();

    // Built by hand rather than mockReq(), whose `stage` default would kick
    // in for an explicit `undefined` and defeat the point of this test.
    await moveStageController({ params: { projectId: '1', pbiId: '2' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'A target stage is required' });
    expect(getPbiById).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist in that project', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await moveStageController(mockReq(), res);

    expect(getPbiById).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('rejects moving a single PBI into Active Sprint, which is a Start Sprint action', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'active_sprint' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot move a PBI into Active Sprint individually. Start the sprint instead.'
    });
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('rejects a move the workflow does not allow, and never writes to the database', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    // product_backlog -> completed is both an illegal skip and a move that
    // US-11 requires to go through the complete-PBI action.
    await moveStageController(mockReq({ stage: 'completed' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot move a PBI into Completed without recording actual hours. Complete the PBI instead.'
    });
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised target stage', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'in_review' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePbiStage).not.toHaveBeenCalled();
  });

  it('moves a PBI from Product Backlog to Sprint Planning and returns it', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const updatedPbi = {
      id: 2,
      project_id: 1,
      title: 'User can upload a profile photo',
      stage: 'sprint_planning'
    };
    updatePbiStage.mockResolvedValue(updatedPbi);
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'sprint_planning' }), res);

    expect(updatePbiStage).toHaveBeenCalledWith(1, 2, 'sprint_planning');
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ pbi: updatedPbi });
  });

  it('returns 404 if the PBI disappears between the check and the update', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    updatePbiStage.mockResolvedValue(null);
    const res = mockRes();

    await moveStageController(mockReq({ stage: 'sprint_planning' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'PBI not found' });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getPbiById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await moveStageController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to move the PBI' });
  });
});

function planningReq({
  projectId = '1',
  pbiId = '2',
  body = {
    planned_start_date: '2026-09-15',
    planned_end_date: '2026-09-22',
    estimated_hours: 16
  }
} = {}) {
  return { params: { projectId, pbiId }, body };
}

describe('updatePlanningController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when the end date is before the start date', async () => {
    const res = mockRes();

    await updatePlanningController(
      planningReq({
        body: {
          planned_start_date: '2026-09-22',
          planned_end_date: '2026-09-15',
          estimated_hours: 16
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('returns 400 when estimated hours are not greater than 0', async () => {
    const res = mockRes();

    await updatePlanningController(
      planningReq({
        body: {
          planned_start_date: '2026-09-15',
          planned_end_date: '2026-09-22',
          estimated_hours: 0
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('returns 400 when the PBI is not in Sprint Planning', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    await updatePlanningController(planningReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Planning details can only be set while a PBI is in Sprint Planning'
    });
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI does not exist', async () => {
    getPbiById.mockResolvedValue(null);
    const res = mockRes();

    await updatePlanningController(planningReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(updatePbiPlanning).not.toHaveBeenCalled();
  });

  it('saves dates and estimated hours without changing stage', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
    const updatedPbi = {
      id: 2,
      project_id: 1,
      stage: 'sprint_planning',
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: '16.00'
    };
    updatePbiPlanning.mockResolvedValue(updatedPbi);
    const res = mockRes();

    await updatePlanningController(planningReq(), res);

    expect(updatePbiPlanning).toHaveBeenCalledWith(1, 2, {
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: 16
    });
    expect(res.json).toHaveBeenCalledWith({ pbi: updatedPbi });
  });
});
