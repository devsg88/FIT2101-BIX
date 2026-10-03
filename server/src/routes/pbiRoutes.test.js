import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import router from './pbiRoutes.js';
import app from '../app.js';
import {
  createPbi,
  deletePbi,
  getPbiById,
  getPbisByProject,
  updatePbiDetails
} from '../models/pbiModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';

// Replace the real database-backed models with fakes we control per test.
// The middleware (requireAuth, requireRole, requireProjectResponsibility) is
// NOT mocked - it runs for real on top of the faked responsibility lookup.
vi.mock('../models/pbiModel.js');
vi.mock('../models/projectModel.js');

// Wiring: inspects the actual Express Router object, the same approach as
// projectRoutes.test.js.
function middlewareNamesFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} route registered for ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle.name);
}

describe('pbiRoutes wiring', () => {
  it('guards GET /:projectId/pbis with auth, admin role and project responsibility', () => {
    expect(middlewareNamesFor('get', '/:projectId/pbis')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'listPbisController'
    ]);
  });

  it('guards POST /:projectId/pbis with auth, admin role and project responsibility', () => {
    expect(middlewareNamesFor('post', '/:projectId/pbis')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'createPbiController'
    ]);
  });

  it('guards PATCH /:projectId/pbis/:pbiId with auth, admin role and project responsibility', () => {
    expect(middlewareNamesFor('patch', '/:projectId/pbis/:pbiId')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'updatePbiDetailsController'
    ]);
  });

  it('guards DELETE /:projectId/pbis/:pbiId with auth, admin role and project responsibility', () => {
    expect(middlewareNamesFor('delete', '/:projectId/pbis/:pbiId')).toEqual([
      'requireAuth',
      'roleGuard',
      'requireProjectResponsibility',
      'deletePbiController'
    ]);
  });
});

// End to end through the real app (app.js mount + middleware + controller),
// using Node's built-in fetch against an ephemeral port.
describe('GET /api/projects/:projectId/pbis (US-04b)', () => {
  const TEST_SECRET = 'pbi-routes-test-secret';
  const ADMIN = { id: '3', role: 'admin' };
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function getPbis(projectId, token) {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/pbis`, { headers });
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

  it('returns 401 with no token, and reads nothing', async () => {
    const res = await getPbis(1);

    expect(res.status).toBe(401);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it('returns 403 for a Developer, before any database lookup', async () => {
    const res = await getPbis(1, tokenFor({ id: '2', role: 'developer' }));

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it('returns 403 for an Admin not responsible for the project, and reads no PBIs', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await getPbis(2, tokenFor(ADMIN));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
    expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    getProjectResponsibility.mockResolvedValue(null);

    const res = await getPbis(999, tokenFor(ADMIN));

    expect(res.status).toBe(404);
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid projectId', async () => {
    const res = await getPbis('abc', tokenFor(ADMIN));

    expect(res.status).toBe(400);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it("returns the project's PBIs to its responsible Admin", async () => {
    const pbis = [
      { id: '1', project_id: '1', title: 'User can reset password', stage: 'product_backlog' }
    ];
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getPbisByProject.mockResolvedValue(pbis);

    const res = await getPbis(1, tokenFor(ADMIN));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pbis });
    expect(getPbisByProject).toHaveBeenCalledWith(1);
  });
});

describe('POST /api/projects/:projectId/pbis (US-04b)', () => {
  const TEST_SECRET = 'pbi-routes-create-test-secret';
  const ADMIN = { id: '3', role: 'admin' };
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function postPbi(projectId, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/pbis`, {
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
    const res = await postPbi(1, { title: 'T' });

    expect(res.status).toBe(401);
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 403 for a Developer, and creates nothing', async () => {
    const res = await postPbi(1, { title: 'T' }, tokenFor({ id: '2', role: 'developer' }));

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 403 for an Admin not responsible for the project, and creates nothing', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await postPbi(2, { title: 'T' }, tokenFor(ADMIN));

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist, and creates nothing', async () => {
    getProjectResponsibility.mockResolvedValue(null);

    const res = await postPbi(999, { title: 'T' }, tokenFor(ADMIN));

    expect(res.status).toBe(404);
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('returns 400 to the responsible Admin for a blank title, and creates nothing', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });

    const res = await postPbi(1, { title: '  ' }, tokenFor(ADMIN));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'A PBI title is required' });
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('lets the responsible Admin create a PBI in the route project with 201', async () => {
    const created = {
      id: '7',
      project_id: '1',
      sprint_id: null,
      title: 'New item',
      description: null,
      stage: 'product_backlog'
    };
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    createPbi.mockResolvedValue(created);

    // A different project_id in the body must not redirect the create.
    const res = await postPbi(1, { title: 'New item', project_id: 2 }, tokenFor(ADMIN));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ pbi: created });
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(createPbi).toHaveBeenCalledWith(1, { title: 'New item', description: null });
  });
});

describe('PATCH /api/projects/:projectId/pbis/:pbiId (US-04b)', () => {
  const TEST_SECRET = 'pbi-routes-edit-test-secret';
  const ADMIN = { id: '3', role: 'admin' };
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function patchPbi(projectId, pbiId, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/pbis/${pbiId}`, {
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
  });

  it('returns 401 with no token, and changes nothing', async () => {
    const res = await patchPbi(1, 1, { title: 'T' });

    expect(res.status).toBe(401);
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for a Developer, and changes nothing', async () => {
    const res = await patchPbi(1, 1, { title: 'T' }, tokenFor({ id: '2', role: 'developer' }));

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for an Admin not responsible for the project, and changes nothing', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await patchPbi(2, 5, { title: 'T' }, tokenFor(ADMIN));

    expect(res.status).toBe(403);
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it('returns 404 when the PBI is not in that project', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    updatePbiDetails.mockResolvedValue(null);

    // PBI 5 belongs to project 2; editing it through project 1 must not work.
    const res = await patchPbi(1, 5, { title: 'T' }, tokenFor(ADMIN));

    expect(res.status).toBe(404);
    expect(updatePbiDetails).toHaveBeenCalledWith(1, 5, { title: 'T' });
  });

  it('lets the responsible Admin edit a PBI and returns it', async () => {
    const updated = { id: '1', project_id: '1', title: 'Renamed', stage: 'product_backlog' };
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    updatePbiDetails.mockResolvedValue(updated);

    const res = await patchPbi(1, 1, { title: ' Renamed ', stage: 'completed' }, tokenFor(ADMIN));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pbi: updated });
    expect(updatePbiDetails).toHaveBeenCalledWith(1, 1, { title: 'Renamed' });
  });
});

describe('DELETE /api/projects/:projectId/pbis/:pbiId (US-04b)', () => {
  const TEST_SECRET = 'pbi-routes-delete-test-secret';
  const ADMIN = { id: '3', role: 'admin' };
  let server;
  let baseUrl;
  let originalSecret;

  function tokenFor(user) {
    return jwt.sign(user, TEST_SECRET, { expiresIn: '5m' });
  }

  function deleteRequest(projectId, pbiId, token) {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/pbis/${pbiId}`, {
      method: 'DELETE',
      headers
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

  it('returns 401 with no token, and deletes nothing', async () => {
    const res = await deleteRequest(1, 1);

    expect(res.status).toBe(401);
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('returns 403 for a Developer, and deletes nothing', async () => {
    const res = await deleteRequest(1, 1, tokenFor({ id: '2', role: 'developer' }));

    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('returns 403 for an Admin not responsible for the project, and deletes nothing', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await deleteRequest(2, 5, tokenFor(ADMIN));

    expect(res.status).toBe(403);
    expect(getPbiById).not.toHaveBeenCalled();
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('returns 400 for a PBI in the Active Sprint, and deletes nothing', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getPbiById.mockResolvedValue({ id: '3', project_id: '1', stage: 'active_sprint' });

    const res = await deleteRequest(1, 3, tokenFor(ADMIN));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: 'Cannot delete a PBI that is in the Active Sprint'
    });
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('lets the responsible Admin delete a Product Backlog PBI and returns it', async () => {
    const pbi = { id: '1', project_id: '1', title: 'User can reset password', stage: 'product_backlog' };
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getPbiById.mockResolvedValue(pbi);
    deletePbi.mockResolvedValue(pbi);

    const res = await deleteRequest(1, 1, tokenFor(ADMIN));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pbi });
    expect(deletePbi).toHaveBeenCalledWith(1, 1);
  });
});
