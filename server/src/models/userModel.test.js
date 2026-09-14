import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import { listDevelopers } from './userModel.js';

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
