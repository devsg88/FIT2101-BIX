import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import router from './projectRoutes.js';
import app from '../app.js';
import {
  createProject,
  listProjectsForResponsibleAdmin,
  getProjectResponsibility,
  updateProjectName,
  deleteEmptyProject,
  setCurrentFocus
} from '../models/projectModel.js';
import { getProjectById } from '../models/boardModel.js';
import { isProjectMember } from '../models/projectMembershipModel.js';

// Replace the real database-backed model with a fake one we control per test.
vi.mock('../models/projectModel.js');
// Used by requireProjectAccess for Developers (US-07 focus route).
vi.mock('../models/boardModel.js');
vi.mock('../models/projectMembershipModel.js');

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

  it('guards GET / with requireAuth then requireRole(\'admin\') before the controller (US-04c)', () => {
    expect(middlewareNamesFor('get', '/')).toEqual([
      'requireAuth',
      'roleGuard',
      'listResponsibleProjectsController'
    ]);
  });

  it('guards PATCH /:projectId with requireAuth, requireRole(\'admin\') then requireProjectResponsibility (US-04c)', () => {
    expect(middlewareNamesFor('patch', '/:projectId')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'updateProjectController'
    ]);
  });

  it('guards DELETE /:projectId with requireAuth, requireRole(\'admin\') then requireProjectResponsibility (US-04c)', () => {
    expect(middlewareNamesFor('delete', '/:projectId')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'deleteProjectController'
    ]);
  });

  it('guards PATCH /:projectId/focus with requireAuth then requireProjectAccess (US-07)', () => {
    expect(middlewareNamesFor('patch', '/:projectId/focus')).toEqual([
      'requireAuth',
      'requireProjectAccess',
      'setCurrentFocusController'
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

// US-04c: the same end-to-end approach for the responsible-project list.
describe('GET /api/projects (US-04c)', () => {
  const TEST_SECRET = 'project-routes-test-secret';
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function getProjects(token) {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${baseUrl}/api/projects`, { headers });
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

  it('returns 401 with no token, and looks nothing up', async () => {
    const res = await getProjects();

    expect(res.status).toBe(401);
    expect(listProjectsForResponsibleAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 for a Developer, and looks nothing up', async () => {
    const res = await getProjects(tokenFor({ id: '2', role: 'developer' }));

    expect(res.status).toBe(403);
    expect(listProjectsForResponsibleAdmin).not.toHaveBeenCalled();
  });

  it('returns 200 with the Admin\'s own responsible projects', async () => {
    const projects = [{ id: '1', name: 'BIX Platform' }];
    listProjectsForResponsibleAdmin.mockResolvedValue(projects);

    const res = await getProjects(tokenFor({ id: '3', role: 'admin' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects });
    expect(listProjectsForResponsibleAdmin).toHaveBeenCalledWith('3');
  });
});

// US-04c: renaming a project (its board), end to end through the real app.
// requireProjectResponsibility runs for real; only the model is faked.
describe('PATCH /api/projects/:projectId (US-04c)', () => {
  const TEST_SECRET = 'project-routes-test-secret';
  const responsibleAdmin = { id: '3', role: 'admin' };
  let server;
  let baseUrl;
  let originalSecret;

  function rename(projectId, user, body = { name: 'Renamed Board' }) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
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
    updateProjectName.mockResolvedValue({ id: '1', name: 'Renamed Board', responsible_admin_id: '3' });
  });

  it('lets the responsible Admin rename the project (200)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await rename(1, responsibleAdmin);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      project: { id: '1', name: 'Renamed Board', responsible_admin_id: '3' }
    });
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(updateProjectName).toHaveBeenCalledWith(1, 'Renamed Board');
  });

  it('refuses a different Admin (403): the responsibility lookup runs, the rename does not', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await rename(1, { id: '7', role: 'admin' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '7');
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('refuses to rename an unowned project (403), without renaming', async () => {
    // getProjectResponsibility maps responsible_admin_id = NULL to isResponsible: false.
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await rename(2, responsibleAdmin);

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('returns 404 for a project that does not exist, without renaming', async () => {
    getProjectResponsibility.mockResolvedValue(null);

    const res = await rename(999, responsibleAdmin);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'Project not found' });
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid projectId, without a lookup or rename', async () => {
    const res = await rename('abc', responsibleAdmin);

    expect(res.status).toBe(400);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('returns 403 to a Developer before any responsibility lookup', async () => {
    const res = await rename(1, { id: '2', role: 'developer' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      message: 'You do not have permission to perform this action'
    });
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('returns 401 with no token, and renames nothing', async () => {
    const res = await rename(1);

    expect(res.status).toBe(401);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(updateProjectName).not.toHaveBeenCalled();
  });
});

// US-04c: deleting an empty project (its board), end to end through the real
// app. requireProjectResponsibility runs for real; only the model is faked -
// whether a project "has work" (PBIs or sprints) is deleteEmptyProject's
// decision, covered per table in projectModel.test.js.
describe('DELETE /api/projects/:projectId (US-04c)', () => {
  const TEST_SECRET = 'project-routes-test-secret';
  const responsibleAdmin = { id: '3', role: 'admin' };
  let server;
  let baseUrl;
  let originalSecret;

  function remove(projectId, user) {
    const headers = {};
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}`, { method: 'DELETE', headers });
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

  it('lets the responsible Admin delete an empty project (200)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    deleteEmptyProject.mockResolvedValue('deleted');

    const res = await remove(5, responsibleAdmin);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Project deleted', id: 5 });
    expect(getProjectResponsibility).toHaveBeenCalledWith(5, '3');
    expect(deleteEmptyProject).toHaveBeenCalledWith(5);
  });

  it('returns 409 to the responsible Admin when the project has work, and keeps it', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    deleteEmptyProject.mockResolvedValue('has_work');

    const res = await remove(1, responsibleAdmin);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      message: 'This board still has work (PBIs or sprints) and cannot be deleted'
    });
  });

  it('refuses a different Admin (403): the responsibility lookup runs, the delete does not', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await remove(5, { id: '7', role: 'admin' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(getProjectResponsibility).toHaveBeenCalledWith(5, '7');
    expect(deleteEmptyProject).not.toHaveBeenCalled();
  });

  it('refuses to delete an unowned project (403), without deleting', async () => {
    // getProjectResponsibility maps responsible_admin_id = NULL to isResponsible: false.
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await remove(2, responsibleAdmin);

    expect(res.status).toBe(403);
    expect(deleteEmptyProject).not.toHaveBeenCalled();
  });

  it('returns 404 for a project that does not exist, without deleting', async () => {
    getProjectResponsibility.mockResolvedValue(null);

    const res = await remove(999, responsibleAdmin);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'Project not found' });
    expect(deleteEmptyProject).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid projectId, without a lookup or delete', async () => {
    const res = await remove('abc', responsibleAdmin);

    expect(res.status).toBe(400);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(deleteEmptyProject).not.toHaveBeenCalled();
  });

  it('returns 403 to a Developer before any responsibility lookup', async () => {
    const res = await remove(5, { id: '2', role: 'developer' });

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(deleteEmptyProject).not.toHaveBeenCalled();
  });

  it('returns 401 with no token, and deletes nothing', async () => {
    const res = await remove(5);

    expect(res.status).toBe(401);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(deleteEmptyProject).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when the delete fails unexpectedly', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    deleteEmptyProject.mockRejectedValue(new Error('connection lost'));

    const res = await remove(5, responsibleAdmin);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: 'Failed to delete the project' });
  });
});

// US-07 / SCRUM-198: setting the Current Focus, end to end through the real
// app. requireProjectAccess runs for real; only the models are faked.
describe('PATCH /api/projects/:projectId/focus (US-07)', () => {
  const TEST_SECRET = 'project-routes-test-secret';
  const responsibleAdmin = { id: '3', role: 'admin' };
  const developer = { id: '5', role: 'developer' };
  let server;
  let baseUrl;
  let originalSecret;

  function setFocus(projectId, user, body = { pbi_id: 7 }) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/focus`, {
      method: 'PATCH',
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
    setCurrentFocus.mockResolvedValue({ id: '1', current_focus_pbi_id: '7' });
  });

  it('lets the responsible Admin set the focus (200)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await setFocus(1, responsibleAdmin);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project: { id: '1', current_focus_pbi_id: '7' } });
    expect(setCurrentFocus).toHaveBeenCalledWith(1, 7);
  });

  it('lets a Developer member set the focus (200)', async () => {
    getProjectById.mockResolvedValue({ id: '1', name: 'BIX Platform' });
    isProjectMember.mockResolvedValue(true);

    const res = await setFocus(1, developer);

    expect(res.status).toBe(200);
    expect(isProjectMember).toHaveBeenCalledWith(1, '5');
    expect(setCurrentFocus).toHaveBeenCalledWith(1, 7);
  });

  it('lets a Developer member clear the focus with null (200)', async () => {
    getProjectById.mockResolvedValue({ id: '1', name: 'BIX Platform' });
    isProjectMember.mockResolvedValue(true);
    setCurrentFocus.mockResolvedValue({ id: '1', current_focus_pbi_id: null });

    const res = await setFocus(1, developer, { pbi_id: null });

    expect(res.status).toBe(200);
    expect(setCurrentFocus).toHaveBeenCalledWith(1, null);
  });

  it('refuses a Developer who is not a member (403), without updating', async () => {
    getProjectById.mockResolvedValue({ id: '1', name: 'BIX Platform' });
    isProjectMember.mockResolvedValue(false);

    const res = await setFocus(1, developer);

    expect(res.status).toBe(403);
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });

  it('refuses an Admin who is not responsible for the project (403)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await setFocus(1, { id: '7', role: 'admin' });

    expect(res.status).toBe(403);
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });

  it('returns 404 for a project that does not exist', async () => {
    getProjectById.mockResolvedValue(null);

    const res = await setFocus(999, developer);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'Project not found' });
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI is not in this project', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    setCurrentFocus.mockResolvedValue(null);

    const res = await setFocus(1, responsibleAdmin, { pbi_id: 99 });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'PBI not found in this project' });
  });

  it('returns 400 for an invalid pbi_id, without updating', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await setFocus(1, responsibleAdmin, { pbi_id: 'seven' });

    expect(res.status).toBe(400);
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid projectId, without a lookup', async () => {
    const res = await setFocus('abc', developer);

    expect(res.status).toBe(400);
    expect(getProjectById).not.toHaveBeenCalled();
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });

  it('returns 401 with no token, and updates nothing', async () => {
    const res = await setFocus(1);

    expect(res.status).toBe(401);
    expect(setCurrentFocus).not.toHaveBeenCalled();
  });
});
