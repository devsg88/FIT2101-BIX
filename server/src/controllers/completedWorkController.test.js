import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCompletedWorkController } from './completedWorkController.js';
import { getCompletedWorkByProject } from '../models/completedWorkModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';

vi.mock('../models/completedWorkModel.js');
vi.mock('../models/projectMembershipModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1', role = 'admin', userId = 1 } = {}) {
  return { params: { projectId }, user: { id: userId, role } };
}

describe('getCompletedWorkController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await getCompletedWorkController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(isProjectMember).not.toHaveBeenCalled();
    expect(getCompletedWorkByProject).not.toHaveBeenCalled();
  });

  it('lets an admin through without checking project membership', async () => {
    getCompletedWorkByProject.mockResolvedValue({ project: { id: 1, name: 'BIX' }, pbis: [] });
    const res = mockRes();

    await getCompletedWorkController(mockReq({ role: 'admin' }), res);

    expect(isProjectMember).not.toHaveBeenCalled();
    expect(getCompletedWorkByProject).toHaveBeenCalledWith(1);
  });

  it('allows a developer who is an assigned member of the project', async () => {
    isProjectMember.mockResolvedValue(true);
    getCompletedWorkByProject.mockResolvedValue({ project: { id: 1, name: 'BIX' }, pbis: [] });
    const res = mockRes();

    await getCompletedWorkController(mockReq({ role: 'developer', userId: 7 }), res);

    expect(isProjectMember).toHaveBeenCalledWith(1, 7);
    expect(getCompletedWorkByProject).toHaveBeenCalledWith(1);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('returns 403 for a developer who is not assigned to the project, and never loads the data', async () => {
    isProjectMember.mockResolvedValue(false);
    const res = mockRes();

    await getCompletedWorkController(mockReq({ role: 'developer', userId: 7 }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "You do not have permission to view this project's completed work"
    });
    expect(getCompletedWorkByProject).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    getCompletedWorkByProject.mockResolvedValue(null);
    const res = mockRes();

    await getCompletedWorkController(mockReq({ role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
  });

  it('returns the completed work history as-is on success', async () => {
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

    await getCompletedWorkController(mockReq({ role: 'admin' }), res);

    expect(res.json).toHaveBeenCalledWith(completedWork);
  });

  it('returns 500 without leaking the error when the membership check throws', async () => {
    isProjectMember.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await getCompletedWorkController(mockReq({ role: 'developer', userId: 7 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load completed work history' });
  });

  it('returns 500 without leaking the error when the model throws', async () => {
    getCompletedWorkByProject.mockRejectedValue(new Error('relation "x" does not exist'));
    const res = mockRes();

    await getCompletedWorkController(mockReq({ role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load completed work history' });
  });
});
