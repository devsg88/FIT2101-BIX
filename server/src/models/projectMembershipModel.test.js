import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  listProjectMembers,
  listAvailableDevelopersForProject,
  addProjectMember,
  removeProjectMember,
  isProjectMember,
  listProjectsForUser,
  getProjectSummariesForUser
} from './projectMembershipModel.js';

describe('projectMembershipModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listProjectMembers joins users onto project_members for the given project', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' }]
    });

    const result = await listProjectMembers(1);

    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/project_members/), [1]);
    expect(result).toEqual([
      { id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' }
    ]);
  });

  it('listAvailableDevelopersForProject excludes existing members and non-developers', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 2, name: 'Developer', email: 'developer@bix.app' }]
    });

    const result = await listAvailableDevelopersForProject(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/role = 'developer'/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(params).toEqual([1]);
    expect(result).toEqual([{ id: 2, name: 'Developer', email: 'developer@bix.app' }]);
  });

  it('addProjectMember inserts with ON CONFLICT DO NOTHING', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await addProjectMember(1, 2);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO project_members/),
      [1, 2]
    );
    expect(pool.query.mock.calls[0][0]).toMatch(/ON CONFLICT/);
  });

  it('removeProjectMember deletes the membership row', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await removeProjectMember(1, 2);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM project_members/),
      [1, 2]
    );
  });

  it('isProjectMember returns true when a membership row exists', async () => {
    pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const result = await isProjectMember(1, 2);

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [1, 2]);
    expect(result).toBe(true);
  });

  it('isProjectMember returns false when no membership row exists', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await isProjectMember(1, 99);

    expect(result).toBe(false);
  });

  it('listProjectsForUser joins projects onto project_members for the given user', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, name: 'BIX Platform' }]
    });

    const result = await listProjectsForUser(2);

    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/project_members/), [2]);
    expect(result).toEqual([{ id: 1, name: 'BIX Platform' }]);
  });

  it('listProjectsForUser returns an empty array when the user has no projects', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await listProjectsForUser(999);

    expect(result).toEqual([]);
  });

  it('getProjectSummariesForUser scopes to the given user and returns status/progress fields', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { id: 1, name: 'BIX Platform', status: 'active', done_count: 3, total_count: 4 }
      ]
    });

    const result = await getProjectSummariesForUser(2);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/project_members/);
    expect(sql).toMatch(/FROM sprints/);
    expect(sql).toMatch(/FROM tasks t/);
    expect(params).toEqual([2]);
    expect(result).toEqual([
      { id: 1, name: 'BIX Platform', status: 'active', done_count: 3, total_count: 4 }
    ]);
  });
});
