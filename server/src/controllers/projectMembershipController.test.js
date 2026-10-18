import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addProjectMemberController,
  getAvailableDevelopersController,
  getProjectMembersController,
  removeProjectMemberController
} from './projectMembershipController.js';
import { getProjectById } from '../models/boardModel.js';
import {
  addProjectMember,
  listAvailableDevelopersForProject,
  listProjectMembers,
  removeProjectMember
} from '../models/projectMembershipModel.js';
import { findUserById } from '../models/userModel.js';

vi.mock('../models/boardModel.js');
vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/userModel.js');

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

describe('getAvailableDevelopersController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the project does not exist', async () => {
    getProjectById.mockResolvedValue(null);
    const res = mockRes();

    await getAvailableDevelopersController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(listAvailableDevelopersForProject).not.toHaveBeenCalled();
  });

  it('returns the candidate developer list for an existing project', async () => {
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    const developers = [{ id: 5, name: 'New Dev', email: 'new@bix.app' }];
    listAvailableDevelopersForProject.mockResolvedValue(developers);
    const res = mockRes();

    await getAvailableDevelopersController(mockReq(), res);

    expect(listAvailableDevelopersForProject).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ developers });
  });
});

describe('addProjectMemberController (NFR-01 frontend audit: US-03/US-05 gap)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockReqWithBody(body, { projectId = '1' } = {}) {
    return { params: { projectId }, body };
  }

  it('returns 400 when user_id is not a positive integer', async () => {
    const res = mockRes();

    await addProjectMemberController(mockReqWithBody({ user_id: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getProjectById).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    getProjectById.mockResolvedValue(null);
    const res = mockRes();

    await addProjectMemberController(mockReqWithBody({ user_id: 5 }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    findUserById.mockResolvedValue(null);
    const res = mockRes();

    await addProjectMemberController(mockReqWithBody({ user_id: 999 }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    expect(addProjectMember).not.toHaveBeenCalled();
  });

  it('never trusts the client: rejects adding a user whose real role is not developer, even if asked to', async () => {
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    findUserById.mockResolvedValue({ id: 9, name: 'Other Admin', role: 'admin' });
    const res = mockRes();

    await addProjectMemberController(mockReqWithBody({ user_id: 9 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Only developers can be added as project members'
    });
    expect(addProjectMember).not.toHaveBeenCalled();
  });

  it('adds the developer and returns the refreshed member list', async () => {
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    findUserById.mockResolvedValue({ id: 5, name: 'New Dev', role: 'developer' });
    const members = [{ id: 5, name: 'New Dev', email: 'new@bix.app', role: 'developer' }];
    listProjectMembers.mockResolvedValue(members);
    const res = mockRes();

    await addProjectMemberController(mockReqWithBody({ user_id: 5 }), res);

    expect(addProjectMember).toHaveBeenCalledWith(1, 5);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ members });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getProjectById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await addProjectMemberController(mockReqWithBody({ user_id: 5 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to add the project member' });
  });
});

describe('removeProjectMemberController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockReqWithParams({ projectId = '1', userId = '5' } = {}) {
    return { params: { projectId, userId } };
  }

  it('returns 400 when userId is not a positive integer', async () => {
    const res = mockRes();

    await removeProjectMemberController(mockReqWithParams({ userId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getProjectById).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    getProjectById.mockResolvedValue(null);
    const res = mockRes();

    await removeProjectMemberController(mockReqWithParams(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(removeProjectMember).not.toHaveBeenCalled();
  });

  it('removes the member and returns the refreshed list', async () => {
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    listProjectMembers.mockResolvedValue([]);
    const res = mockRes();

    await removeProjectMemberController(mockReqWithParams(), res);

    expect(removeProjectMember).toHaveBeenCalledWith(1, 5);
    expect(res.json).toHaveBeenCalledWith({ members: [] });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getProjectById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await removeProjectMemberController(mockReqWithParams(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to remove the project member' });
  });
});
