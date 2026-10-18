import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jsonwebtoken');
vi.mock('../models/projectModel.js');
vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/boardModel.js');
vi.mock('../models/burndownModel.js', () => ({
  getBurndownData: vi.fn()
}));
vi.mock('../models/sprintModel.js', () => ({
  getSprintsByProject: vi.fn()
}));

import jwt from 'jsonwebtoken';
import { getProjectResponsibility } from '../models/projectModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';
import { getProjectById } from '../models/boardModel.js';
import { getBurndownData } from '../models/burndownModel.js';
import { getSprintsByProject } from '../models/sprintModel.js';
import { requireAuth, requireProjectAccess } from '../middleware/authMiddleware.js';
import {
  getBurndownController,
  getProjectSprintsController
} from '../controllers/burndownController.js';
import burndownRoutes from './burndownRoutes.js';

// US-15 (SCRUM-160). Acceptance criterion 8: users who cannot access the
// project cannot access its burndown data. Like completedWorkRoutes.test.js,
// this reads Express's own Router internals (no supertest in this repo): first
// to prove the guards are wired in front of the controllers, then to run each
// route's real handler chain against mocked models.

const BURNDOWN_PATH = '/:projectId/sprints/:sprintId/burndown';
const SPRINTS_PATH = '/:projectId/sprints';

function findRoute(path) {
  return burndownRoutes.stack.find((entry) => entry.route?.path === path);
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// Runs the route's handlers in order, the way Express does: each one either
// calls next() to continue or responds and stops the chain.
async function runRoute(path, req) {
  const res = mockRes();
  for (const layer of findRoute(path).route.stack) {
    let calledNext = false;
    await layer.handle(req, res, () => {
      calledNext = true;
    });
    if (!calledNext) {
      break;
    }
  }
  return res;
}

function request(user, params) {
  if (user) {
    jwt.verify.mockReturnValue(user);
  } else {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
  }
  return { headers: { authorization: 'Bearer token' }, params };
}

const burndownParams = { projectId: '1', sprintId: '2' };
const developer = { id: 7, role: 'developer' };
const admin = { id: 3, role: 'admin' };

describe('burndownRoutes wiring', () => {
  it.each([
    [BURNDOWN_PATH, getBurndownController],
    [SPRINTS_PATH, getProjectSprintsController]
  ])('runs requireAuth then requireProjectAccess before the controller on GET %s', (path, controller) => {
    const layer = findRoute(path);

    expect(layer).toBeDefined();
    expect(layer.route.methods.get).toBe(true);
    const handlers = layer.route.stack.map((handler) => handler.handle);
    expect(handlers).toHaveLength(3);
    expect(handlers.slice(0, 2)).toEqual([requireAuth, requireProjectAccess]);
    // NFR-03: the controller runs inside asyncHandler, which keeps its name.
    expect(handlers[2].name).toBe(controller.name);
    expect(handlers[2]).not.toBe(controller);
  });
});

describe('burndown access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    getBurndownData.mockResolvedValue({
      sprint: { id: 2, name: 'Sprint 2', status: 'active', started_at: null },
      pbis: []
    });
  });

  it('rejects a request with no token with 401', async () => {
    const res = await runRoute(BURNDOWN_PATH, { headers: {}, params: burndownParams });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 401', async () => {
    const res = await runRoute(BURNDOWN_PATH, request(null, burndownParams));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('rejects a Developer who is not a member of the project with 403', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await runRoute(BURNDOWN_PATH, request(developer, burndownParams));

    expect(isProjectMember).toHaveBeenCalledWith(1, 7);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('rejects an Admin who is not responsible for the project with 403', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await runRoute(BURNDOWN_PATH, request(admin, burndownParams));

    expect(getProjectResponsibility).toHaveBeenCalledWith(1, 3);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('rejects any other role with 403', async () => {
    const res = await runRoute(BURNDOWN_PATH, request({ id: 9, role: 'guest' }, burndownParams));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('returns 404 for a project that does not exist, before any burndown read', async () => {
    getProjectById.mockResolvedValue(null);

    const res = await runRoute(BURNDOWN_PATH, request(developer, burndownParams));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(getBurndownData).not.toHaveBeenCalled();
  });

  it('lets a project member read the burndown', async () => {
    isProjectMember.mockResolvedValue(true);

    const res = await runRoute(BURNDOWN_PATH, request(developer, burndownParams));

    expect(getBurndownData).toHaveBeenCalledWith(1, 2);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].sprint.id).toBe(2);
  });

  it('lets the responsible Admin read the burndown', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await runRoute(BURNDOWN_PATH, request(admin, burndownParams));

    expect(getBurndownData).toHaveBeenCalledWith(1, 2);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('Sprint list access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    getSprintsByProject.mockResolvedValue([{ id: 2, name: 'Sprint 2' }]);
  });

  it('rejects a Developer who is not a member of the project with 403', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await runRoute(SPRINTS_PATH, request(developer, { projectId: '1' }));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getSprintsByProject).not.toHaveBeenCalled();
  });

  it('lets a project member list the Sprints', async () => {
    isProjectMember.mockResolvedValue(true);

    const res = await runRoute(SPRINTS_PATH, request(developer, { projectId: '1' }));

    expect(res.json).toHaveBeenCalledWith({ sprints: [{ id: 2, name: 'Sprint 2' }] });
  });
});
