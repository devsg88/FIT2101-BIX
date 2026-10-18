import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import { findUserById, listDevelopers } from './userModel.js';

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

// Added for US-03/US-05: addProjectMemberController uses this to verify a
// target user actually exists and is really a developer, server-side,
// rather than trusting the client's own available-developers list.
describe('findUserById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user row for an existing id', async () => {
    const user = { id: 5, name: 'New Dev', email: 'new@bix.app', role: 'developer' };
    pool.query.mockResolvedValue({ rows: [user] });

    const result = await findUserById(5);

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [5]);
    expect(result).toEqual(user);
  });

  it('returns null when no user matches', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await findUserById(999);

    expect(result).toBeNull();
  });
});
