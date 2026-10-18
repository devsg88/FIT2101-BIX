import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { asyncHandler } from './asyncHandler.js';
import { errorHandler, SERVER_ERROR_MESSAGE } from './errorHandler.js';

describe('asyncHandler', () => {
  it('passes req, res and next through and does not call next on success', async () => {
    const handler = vi.fn(async (req, res) => res.json({ ok: true }));
    const req = {};
    const res = { json: vi.fn() };
    const next = vi.fn();

    await asyncHandler(handler)(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('sends a rejected promise to next', async () => {
    const failure = new Error('database went away');
    const next = vi.fn();

    await asyncHandler(async () => {
      throw failure;
    })({}, {}, next);

    expect(next).toHaveBeenCalledWith(failure);
  });

  it('also sends a synchronous throw to next', async () => {
    const failure = new Error('sync bug');
    const next = vi.fn();

    await asyncHandler(() => {
      throw failure;
    })({}, {}, next);

    expect(next).toHaveBeenCalledWith(failure);
  });

  it('keeps the wrapped handler name for route-wiring tests', () => {
    async function getBoardController() {}

    expect(asyncHandler(getBoardController).name).toBe('getBoardController');
    expect(asyncHandler(async () => {}).name).toBe('asyncHandler');
  });
});

describe('asyncHandler with the central errorHandler', () => {
  let server;
  let baseUrl;
  let logSpy;

  beforeAll(async () => {
    const testApp = express();
    testApp.get('/rejects', asyncHandler(async () => {
      await Promise.resolve();
      throw new Error('internal: connection terminated unexpectedly');
    }));
    testApp.get('/ok', asyncHandler(async (req, res) => res.json({ ok: true })));
    testApp.use(errorHandler);
    await new Promise((resolve) => {
      server = testApp.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('turns an async rejection into the safe JSON 500 instead of a hung request', async () => {
    const res = await fetch(`${baseUrl}/rejects`, { signal: AbortSignal.timeout(2000) });
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ message: SERVER_ERROR_MESSAGE });
    expect(text).not.toContain('connection terminated');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('connection terminated unexpectedly');
  });

  it('leaves successful async handlers unchanged', async () => {
    const res = await fetch(`${baseUrl}/ok`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
