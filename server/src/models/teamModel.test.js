import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  listTeams,
  getTeamById,
  listTeamMembers,
  listAvailableDevelopersForTeam,
  addTeamMember,
  removeTeamMember
} from './teamModel.js';

describe('teamModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listTeams returns every team', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'Team Alpha' }] });

    const result = await listTeams();

    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/FROM teams/));
    expect(result).toEqual([{ id: 1, name: 'Team Alpha' }]);
  });

  it('getTeamById returns null when the team does not exist', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await getTeamById(99);

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [99]);
    expect(result).toBeNull();
  });

  it('listTeamMembers joins users onto team_members for the given team', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' }]
    });

    const result = await listTeamMembers(1);

    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/team_members/), [1]);
    expect(result).toEqual([
      { id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' }
    ]);
  });

  it('listAvailableDevelopersForTeam excludes existing members and non-developers', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 2, name: 'Developer', email: 'developer@bix.app' }]
    });

    const result = await listAvailableDevelopersForTeam(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/role = 'developer'/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(params).toEqual([1]);
    expect(result).toEqual([{ id: 2, name: 'Developer', email: 'developer@bix.app' }]);
  });

  it('addTeamMember inserts with ON CONFLICT DO NOTHING', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await addTeamMember(1, 2);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO team_members/),
      [1, 2]
    );
    expect(pool.query.mock.calls[0][0]).toMatch(/ON CONFLICT/);
  });

  it('removeTeamMember deletes the membership row', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await removeTeamMember(1, 2);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM team_members/),
      [1, 2]
    );
  });
});
