import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  completeTask,
  createPbi,
  deletePbi,
  getBoard,
  getCompletedWork,
  getProjectPbis,
  movePbi,
  requestPasswordReset,
  resetPassword,
  startSprint,
  updatePbi,
  updatePbiPlanning
} from './api.js';

function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('board api helpers', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getBoard performs a GET with the Bearer token and JSON content type', async () => {
    global.fetch.mockImplementation(() => okJson({ project: { id: 7 }, pbis: [] }));

    await getBoard(7, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/board');
    expect(options.method).toBeUndefined();
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123'
    });
  });

  it('movePbi sends PATCH with a JSON body and preserves both headers', async () => {
    await movePbi(7, 42, 'sprint_planning', 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/pbis/42/stage');
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(JSON.stringify({ stage: 'sprint_planning' }));
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123'
    });
  });

  it('updatePbiPlanning forwards the planning payload as the JSON body', async () => {
    const planning = {
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: 16
    };

    await updatePbiPlanning(7, 42, planning, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/pbis/42/planning');
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(JSON.stringify(planning));
  });

  it('startSprint sends POST with the Bearer token', async () => {
    await startSprint(7, 3, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/sprints/3/start');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
  });

  it('throws the server-provided message on a non-ok response', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 501,
        json: () => Promise.resolve({ message: 'Cannot start an empty sprint' })
      })
    );

    await expect(startSprint(7, 3, 'tok-123')).rejects.toThrow(
      'Cannot start an empty sprint'
    );
  });

  it('completeTask posts actual hours', async () => {
    await completeTask(7, 3, 4, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/tasks/3/complete');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ actual_hours: 4 }));
  });

  it('getCompletedWork performs a GET with the Bearer token (US-12)', async () => {
    global.fetch.mockImplementation(() =>
      okJson({ project: { id: 7, name: 'BIX Platform' }, pbis: [] })
    );

    await getCompletedWork(7, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/completed-work');
    expect(options.method).toBeUndefined();
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123'
    });
  });

  it('attaches the response status to a thrown error, so callers can tell a 403 apart from other failures', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Not permitted' })
      })
    );

    await expect(getCompletedWork(7, 'tok-123')).rejects.toMatchObject({
      message: 'Not permitted',
      status: 403
    });
  });
});

describe('getProjectPbis (US-04b)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({ pbis: [] }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs a GET on the project PBI list with the Bearer token', async () => {
    const result = await getProjectPbis(7, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/pbis');
    expect(options.method).toBeUndefined();
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
    expect(result).toEqual({ pbis: [] });
  });

  it("throws the backend's message when the request is refused", async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'You are not responsible for this project' })
      })
    );

    await expect(getProjectPbis(2, 'tok')).rejects.toThrow(
      'You are not responsible for this project'
    );
  });
});

describe('createPbi / updatePbi (US-04b, SCRUM-101)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({ pbi: { id: 1 } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createPbi POSTs the PBI as JSON with both headers', async () => {
    await createPbi(7, { title: 'New item' }, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/pbis');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ title: 'New item' }));
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123'
    });
  });

  it('updatePbi PATCHes only the given changes on that PBI', async () => {
    await updatePbi(7, 42, { description: null }, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/pbis/42');
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe(JSON.stringify({ description: null }));
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
  });
});

describe('deletePbi (US-04b, SCRUM-102)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({ pbi: { id: 42 } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends DELETE for that PBI with the Bearer token', async () => {
    const result = await deletePbi(7, 42, 'tok-123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7/pbis/42');
    expect(options.method).toBe('DELETE');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
    expect(result).toEqual({ pbi: { id: 42 } });
  });

  it("throws the backend's reason when the delete is refused", async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Cannot delete a PBI that is in the Active Sprint' })
      })
    );

    await expect(deletePbi(7, 3, 'tok')).rejects.toThrow(
      'Cannot delete a PBI that is in the Active Sprint'
    );
  });
});

describe('password reset api helpers (US-14)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requestPasswordReset posts the email without an auth header', async () => {
    await requestPasswordReset('developer@bix.app');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/auth/forgot-password');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ email: 'developer@bix.app' }));
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('resetPassword posts token and password without an auth header', async () => {
    await resetPassword({
      token: 'abc',
      password: 'newpass12',
      confirm_password: 'newpass12'
    });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/auth/reset-password');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({
      token: 'abc',
      password: 'newpass12',
      confirm_password: 'newpass12'
    });
  });
});
