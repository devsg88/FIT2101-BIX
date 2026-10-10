import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

vi.mock('./sprintModel.js', () => ({
  getSprintById: vi.fn()
}));

import { pool } from '../config/db.js';
import { getSprintById } from './sprintModel.js';
import { getSprintScope, getBurndownData } from './burndownModel.js';

describe('getSprintScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the Sprint items scoped to both project and Sprint', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getSprintScope(1, 2);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM product_backlog_items/i);
    expect(sql).toMatch(/WHERE project_id = \$1 AND sprint_id = \$2/i);
    expect(params).toEqual([1, 2]);
  });

  it('selects the Story Point, stage and date columns the burndown needs', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getSprintScope(1, 2);

    const [sql] = pool.query.mock.calls[0];
    for (const column of [
      'estimated_hours',
      'stage',
      'planned_end_date',
      'completed_at',
      'updated_at'
    ]) {
      expect(sql).toContain(column);
    }
  });

  it('does not filter out completed items, which are part of the committed scope', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getSprintScope(1, 2);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).not.toMatch(/stage\s*(<>|!=|=)/i);
  });

  it('returns the rows unchanged', async () => {
    const rows = [{ id: 3, stage: 'completed', estimated_hours: '5.00' }];
    pool.query.mockResolvedValue({ rows });

    expect(await getSprintScope(1, 2)).toEqual(rows);
  });
});

describe('getBurndownData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without loading items when the Sprint is not in this project', async () => {
    getSprintById.mockResolvedValue(null);

    expect(await getBurndownData(1, 99)).toBeNull();
    expect(getSprintById).toHaveBeenCalledWith(1, 99);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns the Sprint with its items', async () => {
    const sprint = { id: 2, project_id: 1, name: 'Sprint 2', status: 'active' };
    const pbis = [{ id: 3, stage: 'active_sprint', estimated_hours: '8.00' }];
    getSprintById.mockResolvedValue(sprint);
    pool.query.mockResolvedValue({ rows: pbis });

    expect(await getBurndownData(1, 2)).toEqual({ sprint, pbis });
    expect(pool.query.mock.calls[0][1]).toEqual([1, 2]);
  });
});
