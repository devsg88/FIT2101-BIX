import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBoard,
  login,
  setSessionExpiredHandler,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_FALLBACK_MESSAGE,
  REQUEST_ERROR_FALLBACK_MESSAGE
} from './api.js';

// NFR-03 / SCRUM-191. How the shared request() helper reports failures: a
// request that never got a response gets a plain-language message instead of
// the browser's own wording, and an error response with no message of its
// own gets a general one - while everything the backend already says, and
// NFR-01's session-expiry handling, is left exactly as it was.
function response(status, body, { json = true } = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: json ? () => Promise.resolve(body) : () => Promise.reject(new SyntaxError('Unexpected token <'))
  });
}

describe('request() failure handling', () => {
  let sessionExpired;

  beforeEach(() => {
    sessionExpired = vi.fn();
    setSessionExpiredHandler(sessionExpired);
  });

  afterEach(() => {
    setSessionExpiredHandler(null);
    vi.restoreAllMocks();
  });

  it('turns a network failure into a friendly error with status 0, never "Failed to fetch"', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await getBoard(1, 'token').catch((err) => err);

    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(error.message).not.toMatch(/fetch|TypeError/i);
    expect(error.status).toBe(0);
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('lets a deliberate abort through unchanged', async () => {
    const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    global.fetch = vi.fn().mockRejectedValue(abort);

    await expect(getBoard(1, 'token')).rejects.toBe(abort);
  });

  it('keeps the backend message and status when there is one', async () => {
    global.fetch = vi.fn(() => response(403, { message: 'You are not responsible for this project' }));

    const error = await getBoard(1, 'token').catch((err) => err);

    expect(error.message).toBe('You are not responsible for this project');
    expect(error.status).toBe(403);
  });

  it('uses a general server message for a 5xx without a readable body (e.g. a proxy HTML page)', async () => {
    global.fetch = vi.fn(() => response(502, null, { json: false }));

    const error = await getBoard(1, 'token').catch((err) => err);

    expect(error.message).toBe(SERVER_ERROR_FALLBACK_MESSAGE);
    expect(error.message).not.toMatch(/status|502|Unexpected token/);
    expect(error.status).toBe(502);
  });

  it('uses a general request message for a 4xx without a message', async () => {
    global.fetch = vi.fn(() => response(404, {}));

    const error = await getBoard(1, 'token').catch((err) => err);

    expect(error.message).toBe(REQUEST_ERROR_FALLBACK_MESSAGE);
    expect(error.status).toBe(404);
  });

  it('still reports an expired session on a 401 from an authenticated call (NFR-01)', async () => {
    global.fetch = vi.fn(() => response(401, { message: 'Invalid or expired token' }));

    const error = await getBoard(1, 'token').catch((err) => err);

    expect(sessionExpired).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(401);
  });

  it('does not report an expired session for a failed login (no token sent)', async () => {
    global.fetch = vi.fn(() => response(401, { message: 'Invalid email or password' }));

    const error = await login({ email: 'a@b.c', password: 'x' }).catch((err) => err);

    expect(error.message).toBe('Invalid email or password');
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('returns the parsed body on success, unchanged', async () => {
    global.fetch = vi.fn(() => response(200, { project: { id: 1 }, pbis: [] }));

    await expect(getBoard(1, 'token')).resolves.toEqual({ project: { id: 1 }, pbis: [] });
  });
});
