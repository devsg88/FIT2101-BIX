import { describe, it, expect, vi } from 'vitest';
import {
  moveStageController,
  updatePlanningController
} from './pbiController.js';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('deferred PBI controllers', () => {
  it('moveStageController returns 501 with the standard error shape', async () => {
    const res = mockRes();
    await moveStageController({ params: {}, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Moving a PBI between stages is not implemented yet'
    });
  });

  it('updatePlanningController returns 501 with the standard error shape', async () => {
    const res = mockRes();
    await updatePlanningController({ params: {}, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Updating PBI planning details is not implemented yet'
    });
  });
});
