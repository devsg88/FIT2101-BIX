import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  moveStageController,
  updatePlanningController
} from './pbiController.js';
import { getPbiById, updatePbiStage } from '../models/pbiModel.js';

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

  it('rejects a move the workflow does not allow, and never writes to the database', async () => {
    getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'product_backlog' });
    const res = mockRes();

    // product_backlog -> active_sprint skips a stage, the transition map
    // (US-06/6.3) does not allow it.
    await moveStageController(mockReq({ stage: 'active_sprint' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: expect.stringMatching(/cannot move a pbi/i)
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

describe('updatePlanningController', () => {
  it('returns 501 with the standard error shape (still deferred to US-08b)', async () => {
    const res = mockRes();

    await updatePlanningController({ params: {}, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Updating PBI planning details is not implemented yet'
    });
  });
});
