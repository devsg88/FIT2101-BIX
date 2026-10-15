import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { SERVER_ERROR_MESSAGE } from '../middleware/errorHandler.js';
import { getProjectResponsibility } from '../models/projectModel.js';
import * as boardController from '../controllers/boardController.js';
import * as pbiController from '../controllers/pbiController.js';
import * as breakdownController from '../controllers/breakdownController.js';
import * as taskController from '../controllers/taskController.js';
import * as completionController from '../controllers/completionController.js';
import * as subTaskController from '../controllers/subTaskController.js';
import * as completedWorkController from '../controllers/completedWorkController.js';
import * as projectMembershipController from '../controllers/projectMembershipController.js';
import * as burndownController from '../controllers/burndownController.js';
import * as dashboardController from '../controllers/dashboardController.js';
import * as authController from '../controllers/authController.js';
import * as passwordResetController from '../controllers/passwordResetController.js';

// NFR-03 / SCRUM-189. Proves asyncHandler is really adopted on every route in
// the non-conflicting route files: each controller is replaced by a mock that
// REJECTS - something the real controllers' own try/catch normally prevents -
// and the request goes through the real app (route, auth and access
// middleware, then the wrapped controller). A wrapped route answers the safe
// JSON 500 and the error is logged; an unwrapped one would never answer and
// the rejection would be unhandled.
//
// Middleware order and handler names are still covered by the existing
// route-wiring tests (boardRoutes.test.js, pbiRoutes.test.js, ...), which pass
// unchanged because asyncHandler keeps each controller's name.
//
// Not covered here, deliberately: projectRoutes.js and sprintRoutes.js are not
// wrapped yet - their adoption waits for the overlapping US07 route work.
vi.mock('../models/projectModel.js');
vi.mock('../models/projectMembershipModel.js');
vi.mock('../models/boardModel.js');
vi.mock('../controllers/boardController.js');
vi.mock('../controllers/pbiController.js');
vi.mock('../controllers/breakdownController.js');
vi.mock('../controllers/taskController.js');
vi.mock('../controllers/completionController.js');
vi.mock('../controllers/subTaskController.js');
vi.mock('../controllers/completedWorkController.js');
vi.mock('../controllers/projectMembershipController.js');
vi.mock('../controllers/burndownController.js');
vi.mock('../controllers/dashboardController.js');
vi.mock('../controllers/authController.js');
vi.mock('../controllers/passwordResetController.js');

const TEST_SECRET = 'async-adoption-test-secret';
const INTERNAL = 'internal: relation "tasks" does not exist at character 42';

const SUB_TASK = '/api/projects/1/pbis/2/tasks/3/sub-tasks/4';

// [route file, method, path, controller module, export name, needs a token]
const WRAPPED_ROUTES = [
  ['boardRoutes', 'GET', '/api/projects/1/board', boardController, 'getBoardController'],
  ['pbiRoutes', 'GET', '/api/projects/1/pbis', pbiController, 'listPbisController'],
  ['pbiRoutes', 'POST', '/api/projects/1/pbis', pbiController, 'createPbiController'],
  ['pbiRoutes', 'PATCH', '/api/projects/1/pbis/2', pbiController, 'updatePbiDetailsController'],
  ['pbiRoutes', 'DELETE', '/api/projects/1/pbis/2', pbiController, 'deletePbiController'],
  ['pbiRoutes', 'PATCH', '/api/projects/1/pbis/2/stage', pbiController, 'moveStageController'],
  ['pbiRoutes', 'PATCH', '/api/projects/1/pbis/2/planning', pbiController, 'updatePlanningController'],
  ['taskRoutes', 'GET', '/api/projects/1/pbis/2', breakdownController, 'getPbiBreakdownController'],
  ['taskRoutes', 'POST', '/api/projects/1/pbis/2/tasks', breakdownController, 'createTaskController'],
  ['taskRoutes', 'PATCH', '/api/projects/1/tasks/3', breakdownController, 'updateTaskController'],
  ['taskRoutes', 'POST', '/api/projects/1/tasks/3/sub-tasks', breakdownController, 'createSubTaskController'],
  ['taskRoutes', 'PATCH', '/api/projects/1/sub-tasks/4', breakdownController, 'updateSubTaskController'],
  ['taskRoutes', 'PATCH', '/api/projects/1/pbis/2/tasks/3', taskController, 'editTaskController'],
  ['taskRoutes', 'DELETE', '/api/projects/1/pbis/2/tasks/3', taskController, 'deleteTaskController'],
  ['taskRoutes', 'PATCH', '/api/projects/1/pbis/2/tasks/3/assignee', taskController, 'assignTaskController'],
  ['taskRoutes', 'POST', '/api/projects/1/tasks/3/complete', taskController, 'completeTaskController'],
  ['taskRoutes', 'POST', '/api/projects/1/sub-tasks/4/complete', taskController, 'completeSubTaskController'],
  ['taskRoutes', 'POST', '/api/projects/1/pbis/2/complete', completionController, 'completePbiController'],
  ['subTaskRoutes', 'PATCH', SUB_TASK, subTaskController, 'editSubTaskController'],
  ['subTaskRoutes', 'DELETE', SUB_TASK, subTaskController, 'deleteSubTaskController'],
  ['subTaskRoutes', 'PATCH', `${SUB_TASK}/assignee`, subTaskController, 'assignSubTaskController'],
  ['completedWorkRoutes', 'GET', '/api/projects/1/completed-work', completedWorkController, 'getCompletedWorkController'],
  ['projectMembershipRoutes', 'GET', '/api/projects/1/members', projectMembershipController, 'getProjectMembersController'],
  ['burndownRoutes', 'GET', '/api/projects/1/sprints', burndownController, 'getProjectSprintsController'],
  ['burndownRoutes', 'GET', '/api/projects/1/sprints/5/burndown', burndownController, 'getBurndownController'],
  ['dashboardRoutes', 'GET', '/api/dashboard', dashboardController, 'getDashboardController'],
  ['authRoutes', 'POST', '/api/auth/login', authController, 'loginController'],
  ['authRoutes', 'POST', '/api/auth/forgot-password', passwordResetController, 'forgotPasswordController'],
  ['authRoutes', 'POST', '/api/auth/reset-password', passwordResetController, 'resetPasswordController']
];

const admin = { id: '3', role: 'admin' };

describe('asyncHandler adoption on the non-conflicting routes', () => {
  let server;
  let baseUrl;
  let originalSecret;
  let logSpy;

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
    vi.resetAllMocks();
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function send(method, path, user = admin) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`
      },
      body: method === 'GET' ? undefined : '{}',
      signal: AbortSignal.timeout(3000)
    });
  }

  it('covers all 29 wrapped controllers', () => {
    expect(WRAPPED_ROUTES).toHaveLength(29);
  });

  it.each(WRAPPED_ROUTES)('%s %s %s: a rejecting controller becomes the safe JSON 500', async (file, method, path, controllers, name) => {
    controllers[name].mockRejectedValue(new Error(INTERNAL));

    const res = await send(method, path);
    const text = await res.text();

    expect(controllers[name]).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(JSON.parse(text)).toEqual({ message: SERVER_ERROR_MESSAGE });
    expect(text).not.toContain('relation');
    // The server still receives the error, through the central handler.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain(INTERNAL);
  });

  it('still runs authorization before the wrapped controller (403 and the controller never called)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await send('GET', '/api/projects/1/board');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(boardController.getBoardController).not.toHaveBeenCalled();
  });

  it('still requires a token before the wrapped controller (401)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/1/completed-work`);

    expect(res.status).toBe(401);
    expect(completedWorkController.getCompletedWorkController).not.toHaveBeenCalled();
  });

  it('leaves a successful wrapped controller response exactly as the controller sent it', async () => {
    pbiController.listPbisController.mockImplementation(async (req, res) => res.status(200).json({ pbis: [] }));

    const res = await send('GET', '/api/projects/1/pbis');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pbis: [] });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('passes the controller own 4xx responses through untouched', async () => {
    taskController.deleteTaskController.mockImplementation(async (req, res) =>
      res.status(409).json({ message: 'Cannot delete work items on a completed PBI' })
    );

    const res = await send('DELETE', '/api/projects/1/pbis/2/tasks/3');

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: 'Cannot delete work items on a completed PBI' });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
