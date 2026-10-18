import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSprintAnalytics } from '../models/analyticsModel.js';
import { getSprintAnalyticsController } from './analyticsController.js';

vi.mock('../models/analyticsModel.js', () => ({ getSprintAnalytics: vi.fn() }));

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
