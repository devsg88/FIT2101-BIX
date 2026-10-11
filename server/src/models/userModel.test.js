import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import { listDevelopers, findUserById } from './userModel.js';

describe('listDevelopers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only developers, ordered by name', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 2, name: 'Developer', email: 'developer@bix.app' }]
    });

    const result = await listDevelopers();

    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/role = 'developer'/));
    expect(result).toEqual([{ id: 2, name: 'Developer', email: 'developer@bix.app' }]);
  });
});

// US-09 / SCRUM-177
describe('findUserById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user without the password hash', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: '2', name: 'Developer', email: 'developer@bix.app', role: 'developer' }]
    });

    const user = await findUserById(2);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT id, name, email, role FROM users WHERE id = \$1/);
    expect(sql).not.toMatch(/password_hash|\*/);
    expect(params).toEqual([2]);
    expect(user).toEqual({ id: '2', name: 'Developer', email: 'developer@bix.app', role: 'developer' });
  });

  it('returns null when no user has that id', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await findUserById(999)).toBeNull();
  });
});
