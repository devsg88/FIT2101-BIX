import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCompletedWorkController } from './completedWorkController.js';
import { getCompletedWorkByProject } from '../models/completedWorkModel.js';

vi.mock('../models/completedWorkModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1' } = {}) {
  return { params: { projectId } };
}

// Role/membership access control used to be checked by hand in this
// controller; it is now enforced upstream by requireProjectAccess (see
// completedWorkRoutes.js), which has its own thorough coverage in
// authMiddleware.test.js ("project access" - admin responsible/not,
// developer member/not, invalid role, invalid projectId, missing project,
// a failed lookup). Re-testing that here would just duplicate it against a
// controller that no longer makes any of those decisions itself.
describe('getCompletedWorkController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await getCompletedWorkController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getCompletedWorkByProject).not.toHaveBeenCalled();
  });

  it('returns the completed work history for the requested project', async () => {
    const completedWork = {
      project: { id: 1, name: 'BIX Platform' },
      pbis: [
        {
          id: 10,
          title: 'User can reset password',
          stage: 'completed',
          actual_hours: '10.50',
          tasks: []
        }
      ]
    };
    getCompletedWorkByProject.mockResolvedValue(completedWork);
    const res = mockRes();

    await getCompletedWorkController(mockReq(), res);

    expect(getCompletedWorkByProject).toHaveBeenCalledWith(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(completedWork);
  });

  it('returns 404 when the project does not exist', async () => {
    getCompletedWorkByProject.mockResolvedValue(null);
    const res = mockRes();

    await getCompletedWorkController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
  });

  it('returns an empty completed-work result successfully, not as an error, when the project has no completed history', async () => {
    const emptyResult = { project: { id: 1, name: 'BIX Platform' }, pbis: [] };
    getCompletedWorkByProject.mockResolvedValue(emptyResult);
    const res = mockRes();

    await getCompletedWorkController(mockReq(), res);

    // An empty pbis array is a legitimate result, not the null the model
    // returns for a missing project - this must not be confused with 404
    // or any other error status.
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(emptyResult);
  });

  it('returns 500 without leaking the error when the model throws', async () => {
    getCompletedWorkByProject.mockRejectedValue(new Error('relation "x" does not exist'));
    const res = mockRes();

    await getCompletedWorkController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load completed work history' });
  });
});
