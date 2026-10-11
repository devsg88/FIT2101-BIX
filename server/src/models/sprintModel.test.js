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

  // US-09 (SCRUM-179), AC5: starting a sprint keeps its Scrum Master and
  // Product Owner - the start never writes those columns, and returns them.
  it('keeps the sprint Scrum Master and Product Owner when the sprint starts', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    pool.connect.mockResolvedValue(client);
    const startedSprint = {
      id: '3', status: 'active', scrum_master_id: '1', product_owner_identifier: 'client@example.com'
    };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // PBIs
      .mockResolvedValueOnce({ rows: [startedSprint] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await startSprint(1, 3);

    const [sprintSql] = client.query.mock.calls[2];
    const setClause = sprintSql.slice(sprintSql.indexOf('SET'), sprintSql.indexOf('WHERE'));
    expect(setClause).toMatch(/status = 'active'/);
    expect(setClause).not.toMatch(/scrum_master_id|product_owner_identifier/);
    expect(sprintSql).toMatch(/RETURNING .*scrum_master_id, product_owner_identifier/s);
    expect(result.sprint).toMatchObject({
      scrum_master_id: '1',
      product_owner_identifier: 'client@example.com'
    });
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the Scrum roles with each sprint (US-09)', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await getSprintsByProject(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/s\.scrum_master_id, s\.product_owner_identifier/);
    expect(params).toEqual([1]);
  });

  it('includes the Scrum Master name, keeping sprints with no Scrum Master (US-09)', async () => {
    const rows = [
      { id: '3', scrum_master_id: '1', scrum_master_name: 'Pang' },
      { id: '4', scrum_master_id: null, scrum_master_name: null }
    ];
    pool.query.mockResolvedValue({ rows });

    const result = await getSprintsByProject(1);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/u\.name AS scrum_master_name/);
    // LEFT JOIN, so an untagged sprint is still listed.
    expect(sql).toMatch(/LEFT JOIN users u ON u\.id = s\.scrum_master_id/);
    expect(sql).toMatch(/WHERE s\.project_id = \$1/);
    expect(result).toEqual(rows);
  });
});
