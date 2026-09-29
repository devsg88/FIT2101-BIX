import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import router from './projectRoutes.js';
import app from '../app.js';
import { createProject } from '../models/projectModel.js';

// Replace the real database-backed model with a fake one we control per test.
vi.mock('../models/projectModel.js');

// Wiring: inspects the actual Express Router object, the same approach the
// task routes use - requireAuth keeps its own name when passed by reference,
// and requireRole(...) returns a function named roleGuard (authMiddleware.js).
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('projectRoutes wiring', () => {
  it('guards POST / with requireAuth then requireRole(\'admin\') before the controller', () => {
    expect(middlewareNamesFor('post', '/')).toEqual([
      'requireAuth',
      'roleGuard',
      'createProjectController'
    ]);
  });
});

// End to end through the real app (app.js mount + middleware + controller),
// using Node's built-in fetch against an ephemeral port - no extra test
// dependency. Only the database-backed model is faked.
describe('POST /api/projects', () => {
  const TEST_SECRET = 'project-routes-test-secret';
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function postProject(body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
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
  });

  it('returns 401 with no token, and creates nothing', async () => {
    const res = await postProject({ name: 'P' });

    expect(res.status).toBe(401);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('returns 403 for a Developer, and creates nothing', async () => {
    const res = await postProject({ name: 'P' }, tokenFor({ id: '2', role: 'developer' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      message: 'You do not have permission to perform this action'
    });
    expect(createProject).not.toHaveBeenCalled();
  });

  it('lets an Admin create a project, owned by that Admin, with 201', async () => {
    const created = { id: '10', name: 'Route Project', responsible_admin_id: '3' };
    createProject.mockResolvedValue(created);

    const res = await postProject(
      { name: 'Route Project' },
      tokenFor({ id: '3', role: 'admin' })
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ project: created });
    expect(createProject).toHaveBeenCalledWith('Route Project', '3');
  });

  it('returns 400 to an Admin for a blank name, and creates nothing', async () => {
    const res = await postProject({ name: '   ' }, tokenFor({ id: '3', role: 'admin' }));

    expect(res.status).toBe(400);
    expect(createProject).not.toHaveBeenCalled();
  });
});
