import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProject, getResponsibleProjects, updateProject, deleteProject } from './api.js';

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

  it('getResponsibleProjects sends GET /projects with the Bearer token and returns the list (US-04c)', async () => {
    const projects = [
      { id: '1', name: 'BIX Platform' },
      { id: '3', name: 'US-04d Validation Project' }
    ];
    global.fetch.mockImplementation(() => okJson({ projects }));

    const result = await getResponsibleProjects('tok-admin');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects');
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok-admin' });
    expect(result).toEqual({ projects });
  });

  it('getResponsibleProjects throws the server-provided message on failure (US-04c)', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Failed to load your projects' })
      })
    );

    await expect(getResponsibleProjects('tok-admin')).rejects.toThrow(
      'Failed to load your projects'
    );
  });

  it('updateProject sends PATCH /projects/:projectId with only the name and the Bearer token (US-04c)', async () => {
    const project = { id: '7', name: 'Renamed Board', responsible_admin_id: '3' };
    global.fetch.mockImplementation(() => okJson({ project }));

    const result = await updateProject(7, 'Renamed Board', 'tok-admin');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ name: 'Renamed Board' });
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-admin'
    });
    expect(result).toEqual({ project });
  });

  it('updateProject throws the server-provided message on failure (US-04c)', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'You are not responsible for this project' })
      })
    );

    await expect(updateProject(7, 'X', 'tok-admin')).rejects.toThrow(
      'You are not responsible for this project'
    );
  });

  it('deleteProject sends DELETE /projects/:projectId with the Bearer token and no body (US-04c)', async () => {
    global.fetch.mockImplementation(() => okJson({ message: 'Project deleted', id: 7 }));

    const result = await deleteProject(7, 'tok-admin');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/projects/7');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBeUndefined();
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok-admin' });
    expect(result).toEqual({ message: 'Project deleted', id: 7 });
  });

  it('deleteProject throws the server-provided message, e.g. on 409 (US-04c)', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            message: 'This board still has work (PBIs or sprints) and cannot be deleted'
          })
      })
    );

    await expect(deleteProject(1, 'tok-admin')).rejects.toThrow(
      'This board still has work (PBIs or sprints) and cannot be deleted'
    );
  });
});
