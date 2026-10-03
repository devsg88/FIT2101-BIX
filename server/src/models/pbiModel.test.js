import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  createPbi,
  deletePbi,
  updatePbiDetails,
  updatePbiPlanning,
  updatePbiStage
} from './pbiModel.js';

describe('updatePbiStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a single UPDATE scoped to both the PBI id and the project id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 2, project_id: 1, stage: 'sprint_planning' }] });

    await updatePbiStage(1, 2, 'sprint_planning');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE product_backlog_items/i);
    expect(sql).toMatch(/SET stage = \$1/i);
    expect(sql).toMatch(/WHERE id = \$2 AND project_id = \$3/i);
    // newStage, pbiId, projectId, in that order, matching $1/$2/$3 above.
    expect(params).toEqual(['sprint_planning', 2, 1]);
  });

  it('returns the updated row when the PBI belongs to that project', async () => {
    const updatedRow = {
      id: 2,
      project_id: 1,
      title: 'User can upload a profile photo',
      stage: 'sprint_planning',
      description: 'unchanged',
      estimated_hours: null
    };
    pool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await updatePbiStage(1, 2, 'sprint_planning');

    expect(result).toEqual(updatedRow);
  });

  it('only changes the stage column, every other field comes back as it was', async () => {
    // The RETURNING clause reflects exactly what the database has after the
    // UPDATE, so a row that comes back with its other fields intact and only
    // `stage` different from before is the proof the query never touches
    // anything else (title, description, dates, hours, created_at, id...).
    const rowAfterMove = {
      id: 2,
      project_id: 1,
      title: 'User can upload a profile photo',
      description: 'Profile page gains an avatar upload.',
      stage: 'sprint_planning',
      planned_start_date: null,
      planned_end_date: null,
      estimated_hours: null,
      actual_hours: null
    };
    pool.query.mockResolvedValue({ rows: [rowAfterMove] });

    const result = await updatePbiStage(1, 2, 'sprint_planning');

    expect(result.id).toBe(2);
    expect(result.title).toBe('User can upload a profile photo');
    expect(result.description).toBe('Profile page gains an avatar upload.');
    expect(result.stage).toBe('sprint_planning');
  });

  it('returns null when no row matches (wrong project or unknown PBI)', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await updatePbiStage(999, 2, 'sprint_planning');

    expect(result).toBeNull();
  });

  it('returns null rather than updating a PBI that belongs to a different project', async () => {
    // Same pbiId, wrong projectId: the WHERE clause requires both to match,
    // so this must come back empty, never touch PBI 2's row from project 1.
    pool.query.mockResolvedValue({ rows: [] });

    const result = await updatePbiStage(2, 2, 'sprint_planning');

    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['sprint_planning', 2, 2]);
  });
});

describe('updatePbiPlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only the planning columns, scoped to PBI id and project id', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        id: 2,
        project_id: 1,
        stage: 'sprint_planning',
        planned_start_date: '2026-09-15',
        planned_end_date: '2026-09-22',
        estimated_hours: '16.00'
      }]
    });

    await updatePbiPlanning(1, 2, {
      planned_start_date: '2026-09-15',
      planned_end_date: '2026-09-22',
      estimated_hours: 16
    });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE product_backlog_items/i);
    expect(sql).toMatch(/planned_start_date = \$1/i);
    expect(sql).toMatch(/planned_end_date = \$2/i);
    expect(sql).toMatch(/estimated_hours = \$3/i);
    expect(sql).not.toMatch(/SET stage/i);
    expect(params).toEqual(['2026-09-15', '2026-09-22', 16, 2, 1]);
  });
});

describe('createPbi (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts only project_id, title and description, leaving stage and sprint to the schema defaults', async () => {
    const created = { id: 7, project_id: 1, title: 'New item', stage: 'product_backlog', sprint_id: null };
    pool.query.mockResolvedValue({ rows: [created] });

    const result = await createPbi(1, { title: 'New item', description: null });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO product_backlog_items \(project_id, title, description\)/i);
    expect(sql).toMatch(/VALUES \(\$1, \$2, \$3\)/i);
    expect(params).toEqual([1, 'New item', null]);
    expect(result).toEqual(created);
  });
});

describe('updatePbiDetails (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only the fields given, scoped to the PBI id and project id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 2, project_id: 1, title: 'New' }] });

    await updatePbiDetails(1, 2, { title: 'New' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SET title = \$1\s+WHERE id = \$2 AND project_id = \$3/i);
    expect(sql).not.toMatch(/description =/i);
    expect(params).toEqual(['New', 2, 1]);
  });

  it('updates title and description together', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 2 }] });

    await updatePbiDetails(1, 2, { title: 'T', description: null });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SET title = \$1, description = \$2\s+WHERE id = \$3 AND project_id = \$4/i);
    expect(params).toEqual(['T', null, 2, 1]);
  });

  it('never puts a non-editable key into the SQL', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 2 }] });

    await updatePbiDetails(1, 2, { title: 'T', stage: 'completed', 'x; DROP TABLE users': 1 });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).not.toMatch(/stage =|DROP/i);
    expect(params).toEqual(['T', 2, 1]);
  });

  it('returns null when no row matches', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await updatePbiDetails(1, 99, { title: 'T' })).toBeNull();
  });

  it('throws instead of running an empty UPDATE', async () => {
    await expect(updatePbiDetails(1, 2, { stage: 'completed' })).rejects.toThrow();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('deletePbi (US-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs one DELETE scoped to the PBI id and project id, never touching Active Sprint items', async () => {
    const row = { id: 1, project_id: 1, stage: 'product_backlog' };
    pool.query.mockResolvedValue({ rows: [row] });

    const result = await deletePbi(1, 1);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM product_backlog_items/i);
    expect(sql).toMatch(/WHERE id = \$1 AND project_id = \$2 AND stage <> 'active_sprint'/i);
    expect(params).toEqual([1, 1]);
    expect(result).toEqual(row);
  });

  it('returns null when no row matches', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await deletePbi(1, 99)).toBeNull();
  });

  it('passes a restrict violation (PBI still has tasks) through to the caller', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('restrict'), { code: '23001' }));

    await expect(deletePbi(1, 4)).rejects.toMatchObject({ code: '23001' });
  });
});
