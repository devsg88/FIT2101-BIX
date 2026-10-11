import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}));

import { pool } from '../config/db.js';
import { startSprint, updateSprintRoles, getSprintsByProject } from './sprintModel.js';

describe('startSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves Sprint Planning PBIs and marks the sprint active in one transaction', async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn()
    };
    pool.connect.mockResolvedValue(client);

    const movedPbis = [{ id: 2, stage: 'active_sprint', sprint_id: 3 }];
    const startedSprint = { id: 3, status: 'active' };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: movedPbis })
      .mockResolvedValueOnce({ rows: [startedSprint] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await startSprint(1, 3);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toMatch(/BEGIN/i);
    expect(client.query.mock.calls[1][0]).toMatch(/UPDATE product_backlog_items/i);
    expect(client.query.mock.calls[1][1]).toEqual([3, 1]);
    expect(client.query.mock.calls[2][0]).toMatch(/UPDATE sprints/i);
    expect(client.query.mock.calls[2][1]).toEqual([3, 1]);
    expect(client.query.mock.calls[3][0]).toMatch(/COMMIT/i);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sprint: startedSprint, pbis: movedPbis });
  });

  it('rolls back when the sprint is no longer in planning', async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn()
    };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await startSprint(1, 3);

    expect(result).toBeNull();
    expect(client.query.mock.calls.some(([sql]) => /ROLLBACK/i.test(sql))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// US-09 / SCRUM-176
describe('updateSprintRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const updated = {
    id: '3', project_id: '1', name: 'Sprint 3', status: 'planning',
    scrum_master_id: '2', product_owner_identifier: 'po@bix.app'
  };

  it('updates both roles in one statement scoped to the project, and returns the sprint', async () => {
    pool.query.mockResolvedValue({ rows: [updated] });

    const result = await updateSprintRoles(1, 3, {
      scrumMasterId: 2,
      productOwnerIdentifier: 'po@bix.app'
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE sprints/);
    expect(sql).toMatch(/WHERE project_id = \$1 AND id = \$2/);
    expect(sql).toMatch(/RETURNING .*scrum_master_id, product_owner_identifier/s);
    expect(params).toEqual([1, 3, true, 2, true, 'po@bix.app']);
    expect(result).toEqual(updated);
  });

  it('leaves the Product Owner unchanged when only the Scrum Master is sent', async () => {
    pool.query.mockResolvedValue({ rows: [updated] });

    await updateSprintRoles(1, 3, { scrumMasterId: 2 });

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([1, 3, true, 2, false, null]);
  });

  it('leaves the Scrum Master unchanged when only the Product Owner is sent', async () => {
    pool.query.mockResolvedValue({ rows: [updated] });

    await updateSprintRoles(1, 3, { productOwnerIdentifier: 'Jane' });

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([1, 3, false, null, true, 'Jane']);
  });

  it('clears a role when it is sent as null', async () => {
    pool.query.mockResolvedValue({ rows: [{ ...updated, scrum_master_id: null }] });

    await updateSprintRoles(1, 3, { scrumMasterId: null });

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([1, 3, true, null, false, null]);
  });

  it('passes text as a bound parameter, never interpolated into the SQL', async () => {
    pool.query.mockResolvedValue({ rows: [updated] });

    await updateSprintRoles(1, 3, { productOwnerIdentifier: "x'); DROP TABLE sprints;--" });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(params[5]).toBe("x'); DROP TABLE sprints;--");
  });

  it('returns null when no sprint matched (missing, or in another project)', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await updateSprintRoles(1, 999, { scrumMasterId: 2 })).toBeNull();
  });
});

describe('getSprintsByProject', () => {
  it('returns the Scrum roles with each sprint (US-09)', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getSprintsByProject(1);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/scrum_master_id, product_owner_identifier/);
  });
});
