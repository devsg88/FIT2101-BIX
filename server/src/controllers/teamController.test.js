import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addTeamMemberController,
  getAvailableDevelopersForTeamController,
  getTeamMembersController,
  getTeamsController,
  removeTeamMemberController
} from './teamController.js';
import {
  addTeamMember,
  getTeamById,
  listAvailableDevelopersForTeam,
  listTeamMembers,
  listTeams,
  removeTeamMember
} from '../models/teamModel.js';
import { findUserById } from '../models/userModel.js';

vi.mock('../models/teamModel.js');
vi.mock('../models/userModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({ teamId = '1' } = {}) {
  return { params: { teamId } };
}

describe('getTeamsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns every team', async () => {
    const teams = [{ id: 1, name: 'Team Alpha' }];
    listTeams.mockResolvedValue(teams);
    const res = mockRes();

    await getTeamsController({}, res);

    expect(res.json).toHaveBeenCalledWith({ teams });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    listTeams.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await getTeamsController({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load teams' });
  });
});

describe('getTeamMembersController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when teamId is not a positive integer', async () => {
    const res = mockRes();

    await getTeamMembersController(mockReq({ teamId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTeamById).not.toHaveBeenCalled();
  });

  it('returns 404 when the team does not exist', async () => {
    getTeamById.mockResolvedValue(null);
    const res = mockRes();

    await getTeamMembersController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Team not found' });
    expect(listTeamMembers).not.toHaveBeenCalled();
  });

  it('returns the team and its member list', async () => {
    const team = { id: 1, name: 'Team Alpha' };
    const members = [{ id: 2, name: 'Developer', email: 'developer@bix.app', role: 'developer' }];
    getTeamById.mockResolvedValue(team);
    listTeamMembers.mockResolvedValue(members);
    const res = mockRes();

    await getTeamMembersController(mockReq(), res);

    expect(listTeamMembers).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ team, members });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getTeamById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await getTeamMembersController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load team members' });
  });
});

describe('getAvailableDevelopersForTeamController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the team does not exist', async () => {
    getTeamById.mockResolvedValue(null);
    const res = mockRes();

    await getAvailableDevelopersForTeamController(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(listAvailableDevelopersForTeam).not.toHaveBeenCalled();
  });

  it('returns the candidate developer list for an existing team', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'Team Alpha' });
    const developers = [{ id: 5, name: 'New Dev', email: 'new@bix.app' }];
    listAvailableDevelopersForTeam.mockResolvedValue(developers);
    const res = mockRes();

    await getAvailableDevelopersForTeamController(mockReq(), res);

    expect(listAvailableDevelopersForTeam).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ developers });
  });
});

describe('addTeamMemberController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockReqWithBody(body, { teamId = '1' } = {}) {
    return { params: { teamId }, body };
  }

  it('returns 400 when user_id is not a positive integer', async () => {
    const res = mockRes();

    await addTeamMemberController(mockReqWithBody({ user_id: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTeamById).not.toHaveBeenCalled();
  });

  it('returns 404 when the team does not exist', async () => {
    getTeamById.mockResolvedValue(null);
    const res = mockRes();

    await addTeamMemberController(mockReqWithBody({ user_id: 5 }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Team not found' });
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'Team Alpha' });
    findUserById.mockResolvedValue(null);
    const res = mockRes();

    await addTeamMemberController(mockReqWithBody({ user_id: 999 }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    expect(addTeamMember).not.toHaveBeenCalled();
  });

  it('never trusts the client: rejects adding a user whose real role is not developer, even if asked to', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'Team Alpha' });
    findUserById.mockResolvedValue({ id: 9, name: 'Other Admin', role: 'admin' });
    const res = mockRes();

    await addTeamMemberController(mockReqWithBody({ user_id: 9 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Only developers can be added as team members'
    });
    expect(addTeamMember).not.toHaveBeenCalled();
  });

  it('adds the developer and returns the refreshed member list', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'Team Alpha' });
    findUserById.mockResolvedValue({ id: 5, name: 'New Dev', role: 'developer' });
    const members = [{ id: 5, name: 'New Dev', email: 'new@bix.app', role: 'developer' }];
    listTeamMembers.mockResolvedValue(members);
    const res = mockRes();

    await addTeamMemberController(mockReqWithBody({ user_id: 5 }), res);

    expect(addTeamMember).toHaveBeenCalledWith(1, 5);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ members });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getTeamById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await addTeamMemberController(mockReqWithBody({ user_id: 5 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to add the team member' });
  });
});

describe('removeTeamMemberController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockReqWithParams({ teamId = '1', userId = '5' } = {}) {
    return { params: { teamId, userId } };
  }

  it('returns 400 when userId is not a positive integer', async () => {
    const res = mockRes();

    await removeTeamMemberController(mockReqWithParams({ userId: 'abc' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTeamById).not.toHaveBeenCalled();
  });

  it('returns 404 when the team does not exist', async () => {
    getTeamById.mockResolvedValue(null);
    const res = mockRes();

    await removeTeamMemberController(mockReqWithParams(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(removeTeamMember).not.toHaveBeenCalled();
  });

  it('removes the member and returns the refreshed list', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'Team Alpha' });
    listTeamMembers.mockResolvedValue([]);
    const res = mockRes();

    await removeTeamMemberController(mockReqWithParams(), res);

    expect(removeTeamMember).toHaveBeenCalledWith(1, 5);
    expect(res.json).toHaveBeenCalledWith({ members: [] });
  });

  it('returns 500 without leaking details when something unexpected throws', async () => {
    getTeamById.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockRes();

    await removeTeamMemberController(mockReqWithParams(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to remove the team member' });
  });
});
