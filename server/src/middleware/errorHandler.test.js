import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import app from '../app.js';
import {
  errorHandler,
  formatErrorLog,
  notFoundHandler,
  redact,
  statusOf,
  SERVER_ERROR_MESSAGE
} from './errorHandler.js';

const INTERNAL_DETAIL = 'relation "users" violates SELECT password_hash FROM users';

// A small app that only exists to raise errors at the central handler.
function buildApp() {
  const testApp = express();
  testApp.get('/throws', () => {
    throw new Error(INTERNAL_DETAIL);
  });
  testApp.get('/forbidden', (req, res, next) => {
    next(Object.assign(new Error(INTERNAL_DETAIL), { status: 403 }));
  });
  testApp.get('/teapot', (req, res, next) => {
    next(Object.assign(new Error(INTERNAL_DETAIL), { statusCode: 418 }));
  });
  testApp.get('/unavailable', (req, res, next) => {
    next(Object.assign(new Error(INTERNAL_DETAIL), { status: 503 }));
  });
  testApp.get('/thrown-string', () => {
    throw 'a plain string, not an Error';
  });
  testApp.use(errorHandler);
  return testApp;
}

describe('errorHandler over HTTP', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    await new Promise((resolve) => {
      server = buildApp().listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  let logSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  async function get(path, headers) {
    const res = await fetch(`${baseUrl}${path}`, { headers });
    return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
  }

  it('turns an unexpected thrown error into a generic JSON 500 with no internal detail', async () => {
    const res = await get('/throws');

    expect(res.status).toBe(500);
    expect(res.type).toMatch(/application\/json/);
    expect(JSON.parse(res.text)).toEqual({ message: SERVER_ERROR_MESSAGE });
    expect(res.text).not.toContain('SELECT');
    expect(res.text).not.toContain('stack');
  });

  it('logs the unexpected failure on the server with the detail the client did not get', async () => {
    await get('/throws');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0][0];
    expect(logged).toMatch(/^\[api-error\] \S+ GET \/throws -> 500/);
    expect(logged).toContain(INTERNAL_DETAIL);
    expect(logged).toMatch(/\n\s+at /);
  });

  it('never logs the query string or request headers', async () => {
    await get('/throws?resetToken=abc123secret', { Authorization: 'Bearer header.token.value' });

    const logged = logSpy.mock.calls[0][0];
    expect(logged).toContain('GET /throws -> 500');
    expect(logged).not.toContain('abc123secret');
    expect(logged).not.toContain('header.token.value');
  });

  it('keeps a 4xx status carried by the error, with a fixed message rather than the error text', async () => {
    const res = await get('/forbidden');

    expect(res.status).toBe(403);
    expect(JSON.parse(res.text)).toEqual({ message: 'You do not have permission to perform this action' });
  });

  it('does not log expected client errors', async () => {
    await get('/forbidden');
    await get('/teapot');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('uses a general message for a 4xx status it has no specific wording for', async () => {
    const res = await get('/teapot');

    expect(res.status).toBe(418);
    expect(JSON.parse(res.text)).toEqual({ message: 'The request could not be processed' });
  });

  it('keeps a 5xx status but never its message', async () => {
    const res = await get('/unavailable');

    expect(res.status).toBe(503);
    expect(JSON.parse(res.text)).toEqual({ message: SERVER_ERROR_MESSAGE });
  });

  it('handles something thrown that is not an Error at all', async () => {
    const res = await get('/thrown-string');

    expect(res.status).toBe(500);
    expect(JSON.parse(res.text)).toEqual({ message: SERVER_ERROR_MESSAGE });
  });
});

describe('errorHandler', () => {
  it('hands over to Express when the response has already started', () => {
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const next = vi.fn();
    const err = new Error('late failure');

    errorHandler(err, {}, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('redact', () => {
  const env = {
    DATABASE_URL: 'postgresql://app:pw@localhost:5432/app_db',
    JWT_SECRET: 'not-a-real-test-secret'
  };

  it('removes configured secrets, connection strings, Bearer tokens and JWTs', () => {
    const text = [
      `connect ${env.DATABASE_URL} failed`,
      `signed with ${env.JWT_SECRET}`,
      'other postgres://u:p@db.example:5432/x',
      'Authorization: Bearer abc.def-ghi',
      'token eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJl'
    ].join('\n');

    const safe = redact(text, env);

    expect(safe).not.toContain('pw@localhost');
    expect(safe).not.toContain(env.JWT_SECRET);
    expect(safe).not.toContain('u:p@db.example');
    expect(safe).not.toContain('abc.def-ghi');
    expect(safe).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(safe.match(/\[redacted\]/g).length).toBeGreaterThanOrEqual(5);
  });

  it('leaves ordinary diagnostic text alone', () => {
    expect(redact('column "x" does not exist', env)).toBe('column "x" does not exist');
  });
});

describe('formatErrorLog', () => {
  it('describes a thrown non-Error value without dumping it', () => {
    const logged = formatErrorLog({ password: 'hunter2' }, { method: 'POST', originalUrl: '/api/x?y=1' }, 500, new Date(0));

    expect(logged).toBe('[api-error] 1970-01-01T00:00:00.000Z POST /api/x -> 500\nNon-Error value thrown: object');
  });
});

describe('statusOf', () => {
  it('reads status or statusCode in the 4xx/5xx range and defaults to 500', () => {
    expect(statusOf({ status: 404 })).toBe(404);
    expect(statusOf({ statusCode: 413 })).toBe(413);
    expect(statusOf({ status: 200 })).toBe(500);
    expect(statusOf({ status: 'nope' })).toBe(500);
    expect(statusOf(new Error('x'))).toBe(500);
    expect(statusOf(undefined)).toBe(500);
  });
});

describe('unknown routes on the real app', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it.each([
    ['GET', '/api/does-not-exist'],
    ['POST', '/api/projects/1/not-a-real-action'],
    ['PUT', '/api/projects'],
    ['GET', '/not-an-api-path']
  ])('%s %s answers JSON 404 without echoing the path', async (method, path) => {
    const res = await fetch(`${baseUrl}${path}`, { method });
    const text = await res.text();

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(JSON.parse(text)).toEqual({ message: 'Not found' });
    expect(text).not.toContain(path);
  });

  it('leaves existing routes alone', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

// Markers of a leaked implementation detail: an HTML error page, a stack
// frame, a server or node_modules path, or the parser's own error names.
const LEAK_MARKERS = [/<html/i, /<!DOCTYPE/i, /\bat \S+ \(/, /node_modules/, /[A-Za-z]:\\/, /\/src\//, /SyntaxError/, /PayloadTooLargeError/, /stack/i];

describe('request-body failures on the real app (express.json)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function post(body, contentType = 'application/json') {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body
    });
    return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
  }

  it.each([
    ['malformed JSON', () => post('{"email": bad'), 400, 'The request body is not valid JSON'],
    ['an oversized body', () => post(JSON.stringify({ x: 'a'.repeat(200000) })), 413, 'The request body is too large'],
    ['an unsupported character set', () => post('{}', 'application/json; charset=latin1'), 415, 'The request body character set is not supported']
  ])('answers %s with safe JSON and no implementation detail', async (label, send, status, message) => {
    const res = await send();

    expect(res.status).toBe(status);
    expect(res.type).toMatch(/application\/json/);
    expect(JSON.parse(res.text)).toEqual({ message });
    for (const marker of LEAK_MARKERS) {
      expect(res.text).not.toMatch(marker);
    }
  });

  it('does not echo any part of the malformed body back', async () => {
    const res = await post('{"email": "someone@example.com", "password": oops');

    expect(res.text).not.toContain('someone@example.com');
    expect(res.text).not.toContain('oops');
  });
});

describe('app.js wiring', () => {
  it('registers notFoundHandler then errorHandler as the last two middleware, after every route', () => {
    const stack = app._router.stack;
    expect(stack[stack.length - 2].handle).toBe(notFoundHandler);
    expect(stack[stack.length - 1].handle).toBe(errorHandler);
  });
});
