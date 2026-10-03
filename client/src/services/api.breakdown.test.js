import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, updateTask, createSubTask, updateSubTask, getPbiBreakdown } from './api.js';

describe('breakdown API', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })));
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [createTask, '/projects/7/pbis/10/tasks', 'POST'],
    [updateTask, '/projects/7/tasks/10', 'PATCH'],
    [createSubTask, '/projects/7/tasks/10/sub-tasks', 'POST'],
    [updateSubTask, '/projects/7/sub-tasks/10', 'PATCH']
  ])('%s sends the fields and bearer token to its project-scoped route', async (call, path, method) => {
    const fields = { title: 'Work', description: null };
    await call(7, 10, fields, 'tok');
    expect(fetch).toHaveBeenCalledWith(`http://localhost:4000/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' }, body: JSON.stringify(fields)
    });
  });

  it('retrieves a nested PBI with authentication', async () => {
    await getPbiBreakdown(7, 10, 'tok');
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/projects/7/pbis/10', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' }
    });
  });

  it('propagates server authorization errors', async () => {
    fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'You are not responsible for this project' }) });
    await expect(createTask(7, 10, { title: 'Work' }, 'tok')).rejects.toThrow('You are not responsible');
  });
});
