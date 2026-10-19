import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from './app.js';
import { createProject, deleteEmptyProject, getProjectResponsibility } from './models/projectModel.js';
import { getBoard } from './models/boardModel.js';
import { getPbiById } from './models/pbiModel.js';
import { getTaskInPbi, deleteTaskWithSubTasks } from './models/taskModel.js';

// NFR-03 / SCRUM-192. Representative safe-failure scenarios for the main
// Sprint 2 journeys, through the real app (routes, middleware, controllers,
// central error handling) with the database models faked. Each failure must
// keep its intended status and come back as JSON { message } only, with no
// implementation detail.
//
// Covered elsewhere, not repeated here: an unexpected thrown error and an
// error's status/stack handling (middleware/errorHandler.test.js), async
// rejections (middleware/asyncHandler.test.js), task-delete rollback
// (models/taskModel.test.js), and the per-route validation, access and
// conflict cases in each route's own tests.
vi.mock('./models/projectModel.js');
vi.mock('./models/boardModel.js');
vi.mock('./models/pbiModel.js');
vi.mock('./models/taskModel.js');

const TEST_SECRET = 'safe-failure-test-secret';

// What a raw database failure might carry - none of it may reach a client.
const DB_FAILURE_TEXT =
  'connection to server at "localhost" (127.0.0.1), port 5432 failed: SELECT * FROM projects WHERE id = 1';
function databaseFailure() {
  return Object.assign(new Error(DB_FAILURE_TEXT), { code: '08006', detail: 'Key (id)=(1)', routine: 'errorMissingColumn' });
}

const LEAK_MARKERS = [
  /<html/i, /\bat \S+ \(/, /node_modules/, /[A-Za-z]:\\/, /\/src\//, /stack/i,
  /SELECT|INSERT|UPDATE|DELETE FROM/, /5432/, /08006|23503/, /errorMissingColumn/, /Key \(id\)/,
  new RegExp(TEST_SECRET)
];

const admin = { id: '3', role: 'admin' };
const developer = { id: '7', role: 'developer' };

describe('safe failure across the main journeys', () => {
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

  async function send(method, path, { user, body, rawBody } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
    });
    return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
  }

  // The error contract every failure below must meet.
  function expectSafeError(res, status, message) {
    expect(res.status).toBe(status);
    expect(res.type).toMatch(/application\/json/);
    const body = JSON.parse(res.text);
    expect(Object.keys(body)).toEqual(['message']);
    expect(typeof body.message).toBe('string');
    if (message) expect(body.message).toBe(message);
    for (const marker of LEAK_MARKERS) {
      expect(res.text).not.toMatch(marker);
    }
  }

  describe('expected failures keep their status and their clear message', () => {
    it('400 - invalid input: a blank project name', async () => {
      const res = await send('POST', '/api/projects', { user: admin, body: { name: '   ' } });

      expectSafeError(res, 400, 'A project name is required');
      expect(createProject).not.toHaveBeenCalled();
    });

    it('400 - malformed JSON on a protected route', async () => {
      const res = await send('POST', '/api/projects', { user: admin, rawBody: '{"name": ' });

      expectSafeError(res, 400, 'The request body is not valid JSON');
    });

    it('401 - no token', async () => {
      expectSafeError(await send('GET', '/api/projects'), 401, 'Missing or invalid token');
    });

    it('401 - a token signed with the wrong secret', async () => {
      const forged = jwt.sign(admin, 'some-other-secret');
      const res = await fetch(`${baseUrl}/api/projects`, { headers: { Authorization: `Bearer ${forged}` } });

      expectSafeError(
        { status: res.status, type: res.headers.get('content-type'), text: await res.text() },
        401,
        'Invalid or expired token'
      );
    });

    it('403 - a Developer trying an Admin-only action', async () => {
      const res = await send('POST', '/api/projects', { user: developer, body: { name: 'Mine' } });

      expectSafeError(res, 403, 'You do not have permission to perform this action');
    });

    it('403 - an Admin who is not responsible for the project', async () => {
      getProjectResponsibility.mockResolvedValue({ isResponsible: false });

      const res = await send('PATCH', '/api/projects/1', { user: admin, body: { name: 'Renamed' } });

      expectSafeError(res, 403, 'You are not responsible for this project');
    });

    it('404 - a project that does not exist', async () => {
      getProjectResponsibility.mockResolvedValue(null);

      const res = await send('DELETE', '/api/projects/999', { user: admin });

      expectSafeError(res, 404, 'Project not found');
      expect(deleteEmptyProject).not.toHaveBeenCalled();
    });

    it('404 - an API route that does not exist', async () => {
      expectSafeError(await send('GET', '/api/projects/1/no-such-thing', { user: admin }), 404, 'Not found');
    });

    it('409 - deleting a board that still has work', async () => {
      deleteEmptyProject.mockResolvedValue('has_work');

      const res = await send('DELETE', '/api/projects/1', { user: admin });

      expectSafeError(res, 409, 'This board still has work (PBIs or sprints) and cannot be deleted');
    });
  });

  describe('forced database failures become a safe 500', () => {
    it('creating a project', async () => {
      createProject.mockRejectedValue(databaseFailure());

      expectSafeError(await send('POST', '/api/projects', { user: admin, body: { name: 'New' } }), 500, 'Failed to create the project');
    });

    it('loading a project board', async () => {
      getBoard.mockRejectedValue(databaseFailure());

      expectSafeError(await send('GET', '/api/projects/1/board', { user: admin }), 500, 'Failed to load the project board');
    });

    it('the access check itself', async () => {
      getProjectResponsibility.mockRejectedValue(databaseFailure());

      expectSafeError(await send('GET', '/api/projects/1/board', { user: admin }), 500, 'Failed to check project responsibility');
      expect(getBoard).not.toHaveBeenCalled();
    });

    it('deleting a task (the atomic delete rolled back)', async () => {
      getPbiById.mockResolvedValue({ id: 2, project_id: 1, stage: 'sprint_planning' });
      getTaskInPbi.mockResolvedValue({ id: 3, pbi_id: 2, title: 'Task', status: 'todo' });
      deleteTaskWithSubTasks.mockRejectedValue(databaseFailure());

      const res = await send('DELETE', '/api/projects/1/pbis/2/tasks/3', { user: admin });

      expectSafeError(res, 500, 'Failed to delete the task');
    });
  });
});
