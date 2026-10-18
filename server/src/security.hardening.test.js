import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from './app.js';

// Pre-deployment hardening found during a codebase audit, not part of
// NFR-01's own original checklist (see security.nfr01.test.js): response
// security headers (helmet) and a rate limit on login. Both only matter once
// this API is reachable from somewhere other than localhost, which is why
// they were missed during NFR-01's initial pass.

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

function postLogin(body = {}) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('Security headers (helmet)', () => {
  it('sends defensive headers on a normal response', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-dns-prefetch-control')).toBe('off');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('Login rate limiting', () => {
  it('allows the first 10 attempts from one client and blocks the 11th', async () => {
    for (let i = 0; i < 10; i += 1) {
      // Deliberately invalid body: the limiter must count the request before
      // the controller's own 400 ever runs, so no DB/user setup is needed.
      const res = await postLogin();
      expect(res.status).toBe(400);
    }

    const blocked = await postLogin();
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.message).toMatch(/too many/i);
  });
});
