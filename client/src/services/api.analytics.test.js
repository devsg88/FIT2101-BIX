import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSprintAnalytics, getProjectAnalytics } from './api.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('getSprintAnalytics', () => {
  it('sends the bearer token to the project-scoped endpoint', async () => {
    const data = { sprints: [], developers: [], effort: [], unattributed: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
    expect(await getSprintAnalytics('7', 'token')).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/projects/7/analytics/sprints', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' }
    });
  });

  it('preserves the authorization failure status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403,
      json: async () => ({ message: 'You are not responsible for this project' }) }));
    await expect(getSprintAnalytics('7', 'token')).rejects.toMatchObject({ status: 403 });
  });
});

describe('getProjectAnalytics', () => {
  it('requests the responsible-project collection without accepting a caller-provided admin id', async () => {
    const data = { projects: [], developers: [], effort: [], unattributed: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
    expect(await getProjectAnalytics('token')).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/projects/analytics', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' }
    });
  });

  it('retains backend authorization failure status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) }));
    await expect(getProjectAnalytics('token')).rejects.toMatchObject({ status: 403 });
  });
});
