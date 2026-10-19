import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateProjectFocus } from './api.js';

// US-07 (SCRUM-199). Kept in its own file so the Current Focus helper does not
// touch the shared api.test.js.

function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('current focus api helper (US-07)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updateProjectFocus sends PATCH /projects/:projectId/focus with the PBI id and token', async () => {
    const project = { id: 1, current_focus_pbi_id: 7 };
    global.fetch.mockImplementation(() => okJson({ project }));

    const result = await updateProjectFocus(1, 7, 'tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/1/focus');
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(JSON.stringify({ pbi_id: 7 }));
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok'
    });
    expect(result).toEqual({ project });
  });

  it('sends an explicit null to clear the focus', async () => {
    await updateProjectFocus(1, null, 'tok');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify({ pbi_id: null }));
  });

  it('sends null rather than dropping the field when pbiId is undefined', async () => {
    await updateProjectFocus(1, undefined, 'tok');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify({ pbi_id: null }));
  });

  it('throws the server-provided message on failure', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'PBI not found in this project' })
      })
    );

    await expect(updateProjectFocus(1, 99, 'tok')).rejects.toThrow(
      'PBI not found in this project'
    );
  });
});
