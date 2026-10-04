import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProjectMembersController } from './projectMembershipController.js';
import { getProjectById } from '../models/boardModel.js';
import { listProjectMembers } from '../models/projectMembershipModel.js';

vi.mock('../models/boardModel.js');
vi.mock('../models/projectMembershipModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ projectId = '1' } = {}) {
  return { params: { projectId } };
}

describe('getProjectMembersController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectId is not a positive integer', async () => {
    const res = mockRes();

    await getProjectMembersController(mockReq({ projectId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getProjectById).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    getProjectById.mockResolvedValue(null);
    const res = mockRes();

    await getProjectMembersController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
    expect(listProjectMembers).not.toHaveBeenCalled();
  });

  it('returns the member list for an existing project', async () => {
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    const members = [
      { id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' },
      { id: 2, name: 'Developer', email: 'developer@bix.app', role: 'developer' }
    ];
    listProjectMembers.mockResolvedValue(members);
    const res = mockRes();

    await getProjectMembersController(mockReq(), res);

    expect(listProjectMembers).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ members });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getProjectById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await getProjectMembersController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load project members' });
  });
});
