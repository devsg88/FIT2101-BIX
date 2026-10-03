import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import router from './boardRoutes.js';
import app from '../app.js';
import { getBoard } from '../models/boardModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';

// Replace the real database-backed models with fakes we control per test.
vi.mock('../models/boardModel.js');
vi.mock('../models/projectModel.js');

// Wiring: inspects the actual Express Router object, the same approach the
// project routes use - each guard keeps its own name when passed by reference.
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('boardRoutes wiring (US-04c)', () => {
  it('guards GET /:projectId/board with requireAuth then requireAdminProjectResponsibility', () => {
    expect(middlewareNamesFor('get', '/:projectId/board')).toEqual([
      'requireAuth',
      'requireAdminProjectResponsibility',
      'getBoardController'
    ]);
  });
});

// End to end through the real app (app.js mount + middleware + controller),
// using Node's built-in fetch against an ephemeral port. Only the models are
// faked: getProjectResponsibility answers the ownership question, getBoard
// returns a minimal empty board.
describe('GET /api/projects/:projectId/board (US-04c)', () => {
  const TEST_SECRET = 'board-routes-test-secret';
  const emptyBoard = { project: { id: '1', name: 'BIX Platform' }, sprints: [], pbis: [] };
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function getBoardAs(projectId, user) {
    const headers = {};
    if (user) {
      headers.Authorization = `Bearer ${tokenFor(user)}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/board`, { headers });
  }

  const admin = { id: '3', role: 'admin' };
  const developer = { id: '2', role: 'developer' };

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
    getBoard.mockResolvedValue(emptyBoard);
  });

  it('returns 401 with no token, and loads nothing', async () => {
    const res = await getBoardAs('1');

    expect(res.status).toBe(401);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getBoard).not.toHaveBeenCalled();
  });

  it('lets the responsible Admin read the board', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await getBoardAs('1', admin);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toEqual(emptyBoard.project);
    expect(body.stages.map((entry) => entry.stage)).toEqual([
      'product_backlog',
      'sprint_planning',
      'active_sprint',
      'completed'
    ]);
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(getBoard).toHaveBeenCalledWith(1);
  });

  it('refuses an Admin who is not responsible for the project, without loading the board', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await getBoardAs('2', admin);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(getBoard).not.toHaveBeenCalled();
  });

  it('returns 404 to an Admin for a project that does not exist', async () => {
    getProjectResponsibility.mockResolvedValue(null);

    const res = await getBoardAs('999', admin);

    expect(res.status).toBe(404);
    expect(getBoard).not.toHaveBeenCalled();
  });

  it('leaves Developer board access unchanged: no responsibility check, board loads', async () => {
    const res = await getBoardAs('2', developer);

    expect(res.status).toBe(200);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getBoard).toHaveBeenCalledWith(2);
  });
});
