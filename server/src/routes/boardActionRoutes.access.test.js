import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pbiRouter from './pbiRoutes.js';
import sprintRouter from './sprintRoutes.js';
import { getPbiById, updatePbiPlanning, updatePbiStage } from '../models/pbiModel.js';
import { getSprintById } from '../models/sprintModel.js';
import { getProjectById } from '../models/boardModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';

// US-04b integration with US-04c / US-05: the board actions that Developers
// AND Admins both use - move a PBI's stage, save planning details, start a
// sprint - are guarded by requireProjectAccess, the same guard as the board
// read. A Developer must be a member of the project (project_members); an
// Admin must be its responsible Admin (projects.responsible_admin_id). Admin
// ownership never comes from project_members.
//
// End to end through the real app; only the database-backed models are faked.
vi.mock('../models/pbiModel.js');
vi.mock('../models/sprintModel.js');
vi.mock('../models/boardModel.js');
vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/projectModel.js');

const TEST_SECRET = 'board-action-access-test-secret';
const ADMIN = { id: '3', role: 'admin' };
const DEVELOPER = { id: '2', role: 'developer' };

function middlewareNamesFor(router, method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('board action routes: guard wiring', () => {
  it.each([
    [pbiRouter, 'patch', '/:projectId/pbis/:pbiId/stage', 'moveStageController'],
    [pbiRouter, 'patch', '/:projectId/pbis/:pbiId/planning', 'updatePlanningController'],
    [sprintRouter, 'post', '/:projectId/sprints/:sprintId/start', 'startSprintController']
  ])('%#: guards %s %s with requireAuth then requireProjectAccess', (router, method, path, controller) => {
    expect(middlewareNamesFor(router, method, path)).toEqual([
      'requireAuth',
      'requireProjectAccess',
      controller
    ]);
  });
});

// Each action with a request body that would succeed for an allowed caller.
const ACTIONS = [
  {
    label: 'move stage',
    method: 'PATCH',
    path: (p) => `/api/projects/${p}/pbis/1/stage`,
    body: { stage: 'sprint_planning' },
    writes: () => [updatePbiStage]
  },
  {
    label: 'save planning',
    method: 'PATCH',
    path: (p) => `/api/projects/${p}/pbis/2/planning`,
    body: { planned_start_date: '2026-10-05', planned_end_date: '2026-10-09', estimated_hours: 8 },
    writes: () => [updatePbiPlanning]
  },
  {
    label: 'start sprint',
    method: 'POST',
    path: (p) => `/api/projects/${p}/sprints/3/start`,
    body: undefined,
    writes: () => [getSprintById]
  }
];

describe.each(ACTIONS)('$label: project access', (action) => {
  let server;
  let baseUrl;
  let originalSecret;

  function send(user, projectId = 1) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}${action.path(projectId)}`, {
      method: action.method,
      headers,
      body: action.body === undefined ? undefined : JSON.stringify(action.body)
    });
  }

  function expectControllerNotReached() {
    expect(getPbiById).not.toHaveBeenCalled();
    for (const write of action.writes()) {
      expect(write).not.toHaveBeenCalled();
    }
  }

  beforeAll(async () => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getProjectById.mockResolvedValue({ id: '1', name: 'BIX Platform' });
  });

  it('returns 401 with no token', async () => {
    const res = await send(null);

    expect(res.status).toBe(401);
    expectControllerNotReached();
  });

  it('returns 403 for a Developer who is not a member of the project', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await send(DEVELOPER);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not a member of this project' });
    expect(isProjectMember).toHaveBeenCalledWith(1, '2');
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expectControllerNotReached();
  });

  it('returns 403 for an Admin who is not responsible for the project, without consulting membership', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await send(ADMIN);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(isProjectMember).not.toHaveBeenCalled();
    expectControllerNotReached();
  });

  it('returns 404 for a project that does not exist', async () => {
    getProjectById.mockResolvedValue(null);

    const res = await send(DEVELOPER, 999);

    expect(res.status).toBe(404);
    expectControllerNotReached();
  });

  it('lets a member Developer through to the controller', async () => {
    isProjectMember.mockResolvedValue(true);

    await send(DEVELOPER);

    expect(isProjectMember).toHaveBeenCalledWith(1, '2');
    // Reaching the controller is the point; it then loads the PBI/sprint.
    expect(action.label === 'start sprint' ? getSprintById : getPbiById).toHaveBeenCalled();
  });

  it('lets the responsible Admin through to the controller, without consulting membership', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    await send(ADMIN);

    expect(isProjectMember).not.toHaveBeenCalled();
    expect(action.label === 'start sprint' ? getSprintById : getPbiById).toHaveBeenCalled();
  });
});
