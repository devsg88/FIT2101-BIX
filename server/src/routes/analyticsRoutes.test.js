import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { getProjectResponsibility } from '../models/projectModel.js';
import { getSprintAnalytics, getProjectAnalytics } from '../models/analyticsModel.js';

vi.mock('../models/projectModel.js');
vi.mock('../models/analyticsModel.js');

describe('Sprint analytics HTTP access', () => {
  const secret = 'sprint-analytics-test-secret';
  let previousSecret;
  let server;
  let baseUrl;
  const data = { sprints: [{ id: '2', name: 'Sprint' }], developers: [], effort: [], unattributed: [] };

  function send(user, projectId = '1', token) {
    const headers = {};
    if (user || token) headers.Authorization = `Bearer ${token ?? jwt.sign(user, secret)}`;
    return fetch(`${baseUrl}/api/projects/${projectId}/analytics/sprints`, { headers });
  }

  function sendProjects(user, query = '', token) {
    const headers = {};
    if (user || token) headers.Authorization = `Bearer ${token ?? jwt.sign(user, secret)}`;
    return fetch(`${baseUrl}/api/projects/analytics${query}`, { headers });
  }

  beforeAll(async () => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getSprintAnalytics.mockResolvedValue(data);
    getProjectAnalytics.mockResolvedValue({ projects: [], developers: [], effort: [], unattributed: [] });
  });

  it.each([undefined, 'invalid'])('rejects missing or invalid token %s', async (token) => {
    const res = await send(null, '1', token);
    expect(res.status).toBe(401);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });

  it.each(['developer', 'guest'])('rejects role %s before any project data is read', async (role) => {
    const res = await send({ id: '7', role });
    expect(res.status).toBe(403);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });

  it('returns data only to the responsible admin', async () => {
    const res = await send({ id: '3', role: 'admin' });
    expect(res.status).toBe(200);
    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(getSprintAnalytics).toHaveBeenCalledWith(1);
    expect(await res.json()).toEqual({ project_id: '1', ...data });
  });

  it('rejects an admin responsible for a different project', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });
    const res = await send({ id: '9', role: 'admin' });
    expect(res.status).toBe(403);
    expect(getSprintAnalytics).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
  });

  it('returns 404 for a nonexistent project', async () => {
    getProjectResponsibility.mockResolvedValue(null);
    expect((await send({ id: '3', role: 'admin' })).status).toBe(404);
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });

  it('rejects malformed ids without reading data', async () => {
    expect((await send({ id: '3', role: 'admin' }, 'bad')).status).toBe(400);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });

  it('returns a safe failure response', async () => {
    getSprintAnalytics.mockRejectedValue(new Error('private database details'));
    const res = await send({ id: '3', role: 'admin' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: 'Failed to load Sprint analytics' });
  });

  describe('Project analytics collection', () => {
    it.each([undefined, 'invalid'])('rejects missing or invalid authentication %s', async (token) => {
      expect((await sendProjects(null, '', token)).status).toBe(401);
      expect(getProjectAnalytics).not.toHaveBeenCalled();
    });

    it.each(['developer', 'guest'])('rejects role %s', async (role) => {
      expect((await sendProjects({ id: '7', role })).status).toBe(403);
      expect(getProjectAnalytics).not.toHaveBeenCalled();
    });

    it('uses the authenticated admin, not forged admin/project query parameters', async () => {
      const res = await sendProjects({ id: '3', role: 'admin' }, '?adminId=99&projectId=100');
      expect(res.status).toBe(200);
      expect(getProjectAnalytics).toHaveBeenCalledWith(3);
      expect(getProjectResponsibility).not.toHaveBeenCalled();
      expect(await res.json()).toEqual({ projects: [], developers: [], effort: [], unattributed: [] });
    });

    it('supports another admin without expanding their scope', async () => {
      expect((await sendProjects({ id: '9', role: 'admin' })).status).toBe(200);
      expect(getProjectAnalytics).toHaveBeenCalledWith(9);
    });

    it('returns safe database failure responses', async () => {
      getProjectAnalytics.mockRejectedValue(new Error('private database details'));
      const res = await sendProjects({ id: '3', role: 'admin' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ message: 'Failed to load Project analytics' });
    });
  });
});
