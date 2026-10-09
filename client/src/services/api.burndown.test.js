import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProjectSprints, getSprintBurndown } from './api.js';

// US-15 (SCRUM-161). Kept in its own file so the burndown helpers do not touch
// the shared api.test.js.

function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('burndown api helpers (US-15)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getProjectSprints sends GET /projects/:projectId/sprints with the Bearer token', async () => {
    const sprints = [{ id: 2, name: 'Sprint 2', status: 'active' }];
    global.fetch.mockImplementation(() => okJson({ sprints }));

    const result = await getProjectSprints(1, 'tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/1/sprints');
    expect(options.method).toBeUndefined();
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(result).toEqual({ sprints });
  });

  it('getSprintBurndown sends GET /projects/:projectId/sprints/:sprintId/burndown', async () => {
    const burndown = { sprint: { id: 2 }, series: [], emptyReason: 'no_estimates' };
    global.fetch.mockImplementation(() => okJson(burndown));

    const result = await getSprintBurndown(1, 2, 'tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/1/sprints/2/burndown');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(result).toEqual(burndown);
  });

  it('throws the server message and status when access is refused', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'You are not a member of this project' })
      })
    );

    await expect(getSprintBurndown(1, 2, 'tok')).rejects.toMatchObject({
      message: 'You are not a member of this project',
      status: 403
    });
  });
});
