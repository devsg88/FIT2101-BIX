import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSprintAnalytics, getProjectAnalytics } from '../models/analyticsModel.js';
import { getSprintAnalyticsController, getProjectAnalyticsController } from './analyticsController.js';

vi.mock('../models/analyticsModel.js', () => ({ getSprintAnalytics: vi.fn(), getProjectAnalytics: vi.fn() }));

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('getSprintAnalyticsController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns the real analytics contract', async () => {
    const data = { sprints: [], developers: [], effort: [], unattributed: [] };
    getSprintAnalytics.mockResolvedValue(data);
    const res = response();
    await getSprintAnalyticsController({ params: { projectId: '3' } }, res);
    expect(getSprintAnalytics).toHaveBeenCalledWith(3);
    expect(res.json).toHaveBeenCalledWith({ project_id: '3', ...data });
  });

  it.each(['bad', '0', '-1', '1.5', '9007199254740992'])('rejects invalid project id %s', async (projectId) => {
    const res = response();
    await getSprintAnalyticsController({ params: { projectId } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getSprintAnalytics).not.toHaveBeenCalled();
  });

  it('does not disclose database errors', async () => {
    getSprintAnalytics.mockRejectedValue(new Error('secret SQL and connection string'));
    const res = response();
    await getSprintAnalyticsController({ params: { projectId: '3' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load Sprint analytics' });
  });
});

describe('getProjectAnalyticsController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses only the verified admin identity, ignoring client-supplied scopes', async () => {
    const data = { projects: [], developers: [], effort: [], unattributed: [] };
    getProjectAnalytics.mockResolvedValue(data);
    const res = response();
    await getProjectAnalyticsController({ user: { id: '7' }, query: { adminId: '99', projectId: '100' } }, res);
    expect(getProjectAnalytics).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith(data);
  });

  it.each([undefined, 'bad', '0', '-1', '9007199254740992'])('refuses an invalid identity %s', async (id) => {
    const res = response();
    await getProjectAnalyticsController({ user: { id } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getProjectAnalytics).not.toHaveBeenCalled();
  });

  it('does not disclose query errors', async () => {
    getProjectAnalytics.mockRejectedValue(new Error('private SQL'));
    const res = response();
    await getProjectAnalyticsController({ user: { id: '7' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load Project analytics' });
  });
});
