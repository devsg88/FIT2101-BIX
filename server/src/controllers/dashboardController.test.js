import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardController } from './dashboardController.js';
import { listProjectsForUser } from '../models/projectMembershipModel.js';
import { listTeams } from '../models/teamModel.js';

vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/teamModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('getDashboardController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns real team count for an admin, no fabricated team health fields', async () => {
    listTeams.mockResolvedValue([
      { id: 1, name: 'Team Alpha' },
      { id: 2, name: 'Team Bravo' }
    ]);
    const req = { user: { id: 3, role: 'admin' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(res.json).toHaveBeenCalledWith({
      role: 'admin',
      data: { teamCount: 2 }
    });
  });

  it('returns real project count and list for a developer', async () => {
    listProjectsForUser.mockResolvedValue([{ id: 1, name: 'BIX Platform' }]);
    const req = { user: { id: 2, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(listProjectsForUser).toHaveBeenCalledWith(2);
    expect(res.json).toHaveBeenCalledWith({
      role: 'developer',
      data: { projectCount: 1, projects: [{ id: 1, name: 'BIX Platform' }] }
    });
  });

  it('returns projectCount 0 for a developer with no assigned projects', async () => {
    listProjectsForUser.mockResolvedValue([]);
    const req = { user: { id: 5, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(res.json).toHaveBeenCalledWith({
      role: 'developer',
      data: { projectCount: 0, projects: [] }
    });
  });

  it('returns 500 when the admin query fails', async () => {
    listTeams.mockRejectedValue(new Error('connection lost'));
    const req = { user: { id: 1, role: 'admin' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load dashboard data' });
  });

  it('returns 500 when the developer query fails', async () => {
    listProjectsForUser.mockRejectedValue(new Error('connection lost'));
    const req = { user: { id: 1, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load dashboard data' });
  });
});
