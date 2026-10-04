import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import { getCollaboratorsByProject } from './completionModel.js';

// US-12: Completed Work History reads collaborators through this bulk,
// per-project query (one query per project, not one per PBI) - see the
// comment on it in completionModel.js and on getCollaboratorsByProject's use
// in completedWorkModel.js.
describe('getCollaboratorsByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins through product_backlog_items and scopes to project_id, ordered by pbi_id then name', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getCollaboratorsByProject(1);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM pbi_collaborators pc/i);
    expect(sql).toMatch(/JOIN users u ON u\.id = pc\.user_id/i);
    expect(sql).toMatch(/JOIN product_backlog_items p ON p\.id = pc\.pbi_id/i);
    expect(sql).toMatch(/WHERE p\.project_id = \$1/i);
    expect(sql).toMatch(/ORDER BY pc\.pbi_id, u\.name/i);
    expect(params).toEqual([1]);
  });

  it('returns each row with pbi_id alongside the collaborator fields, so callers can group by PBI', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { pbi_id: 10, id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' },
        { pbi_id: 11, id: 3, name: 'Admin', email: 'admin@bix.app', role: 'admin' }
      ]
    });

    const result = await getCollaboratorsByProject(1);

    expect(result).toEqual([
      { pbi_id: 10, id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' },
      { pbi_id: 11, id: 3, name: 'Admin', email: 'admin@bix.app', role: 'admin' }
    ]);
  });

  it('returns an empty array when the project has no recorded collaborators', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await getCollaboratorsByProject(1);

    expect(result).toEqual([]);
  });
});
