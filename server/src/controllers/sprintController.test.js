import { describe, it, expect, vi } from 'vitest';
import { startSprintController } from './sprintController.js';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('deferred sprint controller', () => {
  it('startSprintController returns 501 with the standard error shape', async () => {
    const res = mockRes();
    await startSprintController({ params: {}, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Starting a sprint is not implemented yet'
    });
  });
});
