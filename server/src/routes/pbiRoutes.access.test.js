import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import {
  createPbi,
  deletePbi,
  getPbiById,
  getPbisByProject,
  updatePbiDetails
} from '../models/pbiModel.js';
import { getProjectResponsibility } from '../models/projectModel.js';

// SCRUM-103 / US-04b. Access-control and validation matrix for the four admin
// PBI endpoints, run end to end through the real app (app.js mount, the real
// requireAuth / requireRole / requireProjectResponsibility, the real
// controllers). Only the database-backed models are faked.
//
// The per-endpoint happy paths live in pbiRoutes.test.js, and the controller
// and model edge cases in pbiController.test.js / pbiModel.test.js. This file
// proves the same rules hold for EVERY endpoint, and that a blocked request
// never reaches the PBI data at all - no read, no write.
vi.mock('../models/pbiModel.js');
vi.mock('../models/projectModel.js');

const TEST_SECRET = 'pbi-access-matrix-test-secret';
const ADMIN = { id: '3', role: 'admin' };
const DEVELOPER = { id: '2', role: 'developer' };

// One entry per US-04b endpoint. `body` is a valid request body, so any
// rejection below is caused by who is calling, not by what they sent.
const ENDPOINTS = [
  { label: 'GET list', method: 'GET', path: (p) => `/api/projects/${p}/pbis` },
  {
    label: 'POST create',
    method: 'POST',
    path: (p) => `/api/projects/${p}/pbis`,
    body: { title: 'New item' }
  },
  {
    label: 'PATCH edit',
    method: 'PATCH',
    path: (p) => `/api/projects/${p}/pbis/1`,
    body: { title: 'Renamed' }
  },
  { label: 'DELETE', method: 'DELETE', path: (p) => `/api/projects/${p}/pbis/1` }
];

const PBI_MODEL_CALLS = [createPbi, deletePbi, getPbiById, getPbisByProject, updatePbiDetails];

function sign(payload, options = {}, secret = TEST_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: '5m', ...options });
}

function expectNoPbiAccess() {
  for (const modelCall of PBI_MODEL_CALLS) {
    expect(modelCall).not.toHaveBeenCalled();
  }
}

describe('US-04b PBI endpoints: access control matrix (SCRUM-103)', () => {
  let server;
  let baseUrl;
  let originalSecret;

  // `query` is appended after the whole path. A GET request cannot carry a
  // body in fetch, so for GET the body is dropped and only `query` applies.
  function send(endpoint, { projectId = 1, authorization, body = endpoint.body, query = '' } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authorization) {
      headers.Authorization = authorization;
    }
    const sendsBody = endpoint.method !== 'GET' && body !== undefined;
    return fetch(`${baseUrl}${endpoint.path(projectId)}${query}`, {
      method: endpoint.method,
      headers,
      body: sendsBody ? JSON.stringify(body) : undefined
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

  describe.each(ENDPOINTS)('$label', (endpoint) => {
    // ---- unauthenticated: 401, and the responsibility lookup never runs
    it.each([
      ['no Authorization header', undefined],
      ['a non-Bearer scheme', `Basic ${Buffer.from('admin:pw').toString('base64')}`],
      ['"Bearer" with no token', 'Bearer '],
      ['a malformed token', 'Bearer not-a-jwt'],
      ['a token signed with the wrong secret', `Bearer ${sign(ADMIN, {}, 'attacker-secret')}`],
      ['an expired token', `Bearer ${sign(ADMIN, { expiresIn: -60 })}`]
    ])('rejects %s with 401', async (_label, authorization) => {
      const res = await send(endpoint, { authorization });

      expect(res.status).toBe(401);
      expect(getProjectResponsibility).not.toHaveBeenCalled();
      expectNoPbiAccess();
    });

    // ---- authenticated non-admins: 403 before any database lookup
    it('rejects a Developer with 403', async () => {
      const res = await send(endpoint, { authorization: `Bearer ${sign(DEVELOPER)}` });

      expect(res.status).toBe(403);
      expect(getProjectResponsibility).not.toHaveBeenCalled();
      expectNoPbiAccess();
    });

    it('rejects a Developer who claims role "admin" in the request body or query', async () => {
      const res = await send(endpoint, {
        authorization: `Bearer ${sign(DEVELOPER)}`,
        body: { ...endpoint.body, role: 'admin', id: '3' },
        query: '?role=admin&id=3'
      });

      expect(res.status).toBe(403);
      expectNoPbiAccess();
    });

    it('rejects a token with no role at all', async () => {
      const res = await send(endpoint, { authorization: `Bearer ${sign({ id: '9' })}` });

      expect([401, 403]).toContain(res.status);
      expectNoPbiAccess();
    });

    // ---- admins who are not responsible for this project
    it('rejects an Admin responsible for a different project with 403', async () => {
      getProjectResponsibility.mockResolvedValue({ isResponsible: false });

      const res = await send(endpoint, { projectId: 2, authorization: `Bearer ${sign(ADMIN)}` });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
      expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
      expectNoPbiAccess();
    });

    it('rejects every Admin on a project with no responsible Admin (NULL owner)', async () => {
      // getProjectResponsibility reports an unowned project as not responsible.
      getProjectResponsibility.mockResolvedValue({ isResponsible: false });

      const res = await send(endpoint, { projectId: 2, authorization: `Bearer ${sign(ADMIN)}` });

      expect(res.status).toBe(403);
      expectNoPbiAccess();
    });

    it('cannot be pointed at another project through the body or query string', async () => {
      // Responsible for project 1 only; the route says project 2.
      getProjectResponsibility.mockImplementation(async (projectId) => ({
        isResponsible: projectId === 1
      }));

      const res = await send(endpoint, {
        projectId: 2,
        authorization: `Bearer ${sign(ADMIN)}`,
        body: { ...endpoint.body, projectId: 1, project_id: 1 },
        query: '?projectId=1'
      });

      expect(res.status).toBe(403);
      expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
      expectNoPbiAccess();
    });

    // ---- target does not exist / is invalid
    it('returns 404 for a project that does not exist', async () => {
      getProjectResponsibility.mockResolvedValue(null);

      const res = await send(endpoint, { projectId: 999, authorization: `Bearer ${sign(ADMIN)}` });

      expect(res.status).toBe(404);
      expectNoPbiAccess();
    });

    it('returns 400 for an invalid projectId', async () => {
      const res = await send(endpoint, { projectId: 'abc', authorization: `Bearer ${sign(ADMIN)}` });

      expect(res.status).toBe(400);
      expect(getProjectResponsibility).not.toHaveBeenCalled();
      expectNoPbiAccess();
    });

    it('returns a generic 500 if the responsibility check itself fails, and touches no PBI', async () => {
      getProjectResponsibility.mockRejectedValue(new Error('password authentication failed'));

      const res = await send(endpoint, { authorization: `Bearer ${sign(ADMIN)}` });

      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toMatch(/password authentication/);
      expectNoPbiAccess();
    });
  });
});

// Validation through the full stack, as the responsible Admin, so the only
// thing wrong with each request is its data.
describe('US-04b PBI endpoints: validation errors (SCRUM-103)', () => {
  let server;
  let baseUrl;
  let originalSecret;
  const auth = () => `Bearer ${sign(ADMIN)}`;

  function send(method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: auth() },
      body: body === undefined ? undefined : JSON.stringify(body)
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
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
  });

  it.each([
    ['no body', undefined, 'A PBI title is required'],
    ['an empty body', {}, 'A PBI title is required'],
    ['a null title', { title: null }, 'A PBI title is required'],
    ['a blank title', { title: '   ' }, 'A PBI title is required'],
    ['a numeric title', { title: 123 }, 'The PBI title must be text'],
    ['a non-text description', { title: 'T', description: ['x'] }, 'The PBI description must be text']
  ])('POST create with %s returns 400 and creates nothing', async (_label, body, message) => {
    const res = await send('POST', '/api/projects/1/pbis', body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message });
    expect(createPbi).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body', {}, 'Provide a title or description to update'],
    ['only non-editable fields', { stage: 'completed', sprint_id: 4 }, 'Provide a title or description to update'],
    ['a blank title', { title: '  ' }, 'The PBI title cannot be blank'],
    ['a null title', { title: null }, 'The PBI title must be text'],
    ['a non-text description', { description: 42 }, 'The PBI description must be text']
  ])('PATCH edit with %s returns 400 and changes nothing', async (_label, body, message) => {
    const res = await send('PATCH', '/api/projects/1/pbis/1', body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message });
    expect(updatePbiDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['PATCH', { title: 'T' }],
    ['DELETE', undefined]
  ])('%s with an invalid pbiId returns 400 and touches nothing', async (method, body) => {
    const res = await send(method, '/api/projects/1/pbis/abc', body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'A valid pbiId is required' });
    expectNoPbiAccess();
  });

  it('PATCH on a PBI that is not in this project returns 404', async () => {
    updatePbiDetails.mockResolvedValue(null);

    const res = await send('PATCH', '/api/projects/1/pbis/5', { title: 'T' });

    expect(res.status).toBe(404);
  });

  it('DELETE on a PBI that is not in this project returns 404 and deletes nothing', async () => {
    getPbiById.mockResolvedValue(null);

    const res = await send('DELETE', '/api/projects/1/pbis/5');

    expect(res.status).toBe(404);
    expect(deletePbi).not.toHaveBeenCalled();
  });
});

// The business safety rule: a PBI that is being worked on in the Active
// Sprint can never be deleted, whoever asks.
describe('US-04b DELETE: Active Sprint safety rule (SCRUM-103)', () => {
  let server;
  let baseUrl;
  let originalSecret;

  function deleteAs(user, pbiId = 3) {
    return fetch(`${baseUrl}/api/projects/1/pbis/${pbiId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sign(user)}` }
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
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
  });

  it('blocks the responsible Admin from deleting an Active Sprint PBI with 400', async () => {
    // Mirrors seed PBI 3, "Dashboard shows sprint burndown", in Sprint 2 (active).
    getPbiById.mockResolvedValue({ id: '3', project_id: '1', sprint_id: '2', stage: 'active_sprint' });

    const res = await deleteAs(ADMIN);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'Cannot delete a PBI that is in the Active Sprint' });
    expect(getPbiById).toHaveBeenCalledWith(1, 3);
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('still allows deleting a PBI in another stage, so the block is specific to Active Sprint', async () => {
    const pbi = { id: '1', project_id: '1', sprint_id: null, stage: 'product_backlog' };
    getPbiById.mockResolvedValue(pbi);
    deletePbi.mockResolvedValue(pbi);

    const res = await deleteAs(ADMIN, 1);

    expect(res.status).toBe(200);
    expect(deletePbi).toHaveBeenCalledWith(1, 1);
  });

  it('does not delete if the PBI moves into Active Sprint after the check (409, nothing deleted)', async () => {
    // The check sees Sprint Planning, but by the time the DELETE runs the
    // sprint has started; deletePbi's own stage condition matches no row.
    getPbiById.mockResolvedValue({ id: '2', project_id: '1', stage: 'sprint_planning' });
    deletePbi.mockResolvedValue(null);

    const res = await deleteAs(ADMIN, 2);

    expect(res.status).toBe(409);
  });

  it('a Developer cannot even reach the Active Sprint check', async () => {
    const res = await deleteAs(DEVELOPER);

    expect(res.status).toBe(403);
    expectNoPbiAccess();
  });
});
