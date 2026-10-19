import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addTeamMember,
  getAvailableDevelopersForTeam,
  getTeams,
  getTeamMembers,
  removeTeamMember
} from './api.js';

// Kept in its own file so these helpers do not touch the shared api.test.js.

function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('team api helpers', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() => okJson({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getTeams calls GET /teams with the token', async () => {
    const teams = [{ id: 1, name: 'Team Alpha' }];
    global.fetch.mockImplementation(() => okJson({ teams }));

    const result = await getTeams('tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/teams');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(result).toEqual({ teams });
  });

  it('getTeamMembers calls GET /teams/:teamId/members', async () => {
    const team = { id: 1, name: 'Team Alpha' };
    const members = [{ id: 2, name: 'Developer', email: 'developer@bix.app', role: 'developer' }];
    global.fetch.mockImplementation(() => okJson({ team, members }));

    const result = await getTeamMembers(1, 'tok');

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/teams/1/members');
    expect(result).toEqual({ team, members });
  });

  it('getAvailableDevelopersForTeam calls GET /teams/:teamId/available-developers', async () => {
    await getAvailableDevelopersForTeam(1, 'tok');

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/teams/1/available-developers');
  });

  it('addTeamMember calls POST /teams/:teamId/members with user_id', async () => {
    await addTeamMember(1, 5, 'tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/teams/1/members');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ user_id: 5 }));
  });

  it('removeTeamMember calls DELETE /teams/:teamId/members/:userId', async () => {
    await removeTeamMember(1, 5, 'tok');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/teams/1/members/5');
    expect(options.method).toBe('DELETE');
  });

  it('throws the server-provided message on failure', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Team not found' })
      })
    );

    await expect(getTeamMembers(99, 'tok')).rejects.toThrow('Team not found');
  });
});
