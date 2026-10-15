import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import app from '../app.js';
import { errorHandler, statusOf, SERVER_ERROR_MESSAGE } from './errorHandler.js';

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

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`);
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

  it('keeps a 4xx status carried by the error, with a fixed message rather than the error text', async () => {
    const res = await get('/forbidden');

    expect(res.status).toBe(403);
    expect(JSON.parse(res.text)).toEqual({ message: 'You do not have permission to perform this action' });
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

describe('app.js wiring', () => {
  it('registers errorHandler as the last middleware, after every route', () => {
    const stack = app._router.stack;
    expect(stack[stack.length - 1].handle).toBe(errorHandler);
  });
});
