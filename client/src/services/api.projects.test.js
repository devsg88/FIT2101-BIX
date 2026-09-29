import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProject } from './api.js';

// Kept separate from api.test.js (the board helpers) so US-04d's API test
// does not touch that shared file.

function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('project api helpers (US-04d)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createProject sends POST /projects with only the name as JSON and the Bearer token', async () => {
    const project = { id: 10, name: 'New Project', responsible_admin_id: 3 };
    global.fetch.mockImplementation(() => okJson({ project }));

    const result = await createProject('New Project', 'tok-admin');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ name: 'New Project' });
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-admin'
    });
    expect(result).toEqual({ project });
  });

  it('throws the server-provided message when creation is rejected', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({ message: 'You do not have permission to perform this action' })
      })
    );

    await expect(createProject('P', 'tok-dev')).rejects.toThrow(
      'You do not have permission to perform this action'
    );
  });
});
