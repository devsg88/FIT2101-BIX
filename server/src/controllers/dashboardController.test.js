import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardController } from './dashboardController.js';
import { getProjectSummariesForUser } from '../models/projectMembershipModel.js';
import { getTasksAssignedToUser } from '../models/pbiModel.js';
import { listTeams } from '../models/teamModel.js';

vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/pbiModel.js');
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

  it('returns project status/progress, task count and recent history for a developer', async () => {
    getProjectSummariesForUser.mockResolvedValue([
      { id: 1, name: 'BIX Platform', status: 'active', done_count: 3, total_count: 4 }
    ]);
    getTasksAssignedToUser.mockResolvedValue([
      { id: 10, title: 'Build login form', status: 'done', completed_at: new Date().toISOString(), project_id: 1, project_name: 'BIX Platform' },
      { id: 11, title: 'Wire auth API', status: 'in_progress', completed_at: null, project_id: 1, project_name: 'BIX Platform' }
    ]);
    const req = { user: { id: 2, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(getProjectSummariesForUser).toHaveBeenCalledWith(2);
    expect(getTasksAssignedToUser).toHaveBeenCalledWith(2);

    const [[payload]] = res.json.mock.calls;
    expect(payload.role).toBe('developer');
    expect(payload.data.projectCount).toBe(1);
    expect(payload.data.projects).toEqual([
      { id: 1, name: 'BIX Platform', status: 'active', progress: 75 }
    ]);
    expect(payload.data.myTasksCount).toBe(1);
    expect(payload.data.overallProgressPercent).toBe(75);
    expect(payload.data.taskHistory).toEqual([
      { id: 10, title: 'Build login form', projectName: 'BIX Platform', completedAt: expect.any(String) }
    ]);
  });

  it('excludes a task completed more than 7 days ago from Task History', async () => {
    getProjectSummariesForUser.mockResolvedValue([]);
    const longAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    getTasksAssignedToUser.mockResolvedValue([
      { id: 20, title: 'Old task', status: 'done', completed_at: longAgo, project_id: 1, project_name: 'BIX Platform' }
    ]);
    const req = { user: { id: 2, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    const [[payload]] = res.json.mock.calls;
    expect(payload.data.taskHistory).toEqual([]);
    expect(payload.data.myTasksCount).toBe(0);
  });

  it('returns null progress (not 0%) for a project or overall figure with no tasks at all', async () => {
    getProjectSummariesForUser.mockResolvedValue([
      { id: 1, name: 'Empty Project', status: 'not-started', done_count: 0, total_count: 0 }
    ]);
    getTasksAssignedToUser.mockResolvedValue([]);
    const req = { user: { id: 5, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    const [[payload]] = res.json.mock.calls;
    expect(payload.data.projects).toEqual([
      { id: 1, name: 'Empty Project', status: 'not-started', progress: null }
    ]);
    expect(payload.data.overallProgressPercent).toBeNull();
  });

  it('returns projectCount 0 for a developer with no assigned projects', async () => {
    getProjectSummariesForUser.mockResolvedValue([]);
    getTasksAssignedToUser.mockResolvedValue([]);
    const req = { user: { id: 5, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(res.json).toHaveBeenCalledWith({
      role: 'developer',
      data: {
        projectCount: 0,
        projects: [],
        myTasksCount: 0,
        overallProgressPercent: null,
        taskHistory: []
      }
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
    getProjectSummariesForUser.mockRejectedValue(new Error('connection lost'));
    getTasksAssignedToUser.mockResolvedValue([]);
    const req = { user: { id: 1, role: 'developer' } };
    const res = mockRes();

    await getDashboardController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load dashboard data' });
  });
});
