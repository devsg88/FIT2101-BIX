import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateWorkItemRoles } from './api.js';

// US-09 (SCRUM-178). Kept in its own file so the sprint roles helper does not
// touch the shared api.test.js.

function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('sprint roles api helper (US-09)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends PATCH /projects/:projectId/sprints/:sprintId/roles with both roles and the token', async () => {
    const sprint = { id: 3, scrum_master_id: 1, product_owner_identifier: 'po@bix.app' };
    global.fetch.mockImplementation(() => okJson({ sprint }));

    const result = await updateWorkItemRoles(1, 3, 1, 'po@bix.app', 'tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/1/sprints/3/roles');
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(
      JSON.stringify({ scrum_master_id: 1, product_owner_identifier: 'po@bix.app' })
    );
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok'
    });
    expect(result).toEqual({ sprint });
  });

  it('sends explicit nulls to clear both roles', async () => {
    await updateWorkItemRoles(1, 3, null, undefined, 'tok');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBe(
      JSON.stringify({ scrum_master_id: null, product_owner_identifier: null })
    );
  });

  it('throws the server message and status for a fake Scrum Master (400, AC4)', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'The Scrum Master must be an existing user' })
      })
    );

    const failure = updateWorkItemRoles(1, 3, 999, null, 'tok');

    await expect(failure).rejects.toThrow('The Scrum Master must be an existing user');
    await expect(failure).rejects.toMatchObject({ status: 400 });
  });
});
