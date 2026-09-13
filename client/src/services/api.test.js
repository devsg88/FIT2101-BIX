import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBoard, movePbi, startSprint, updatePbiPlanning } from './api.js';

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
});
