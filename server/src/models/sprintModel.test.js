import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}));

import { pool } from '../config/db.js';
import { startSprint } from './sprintModel.js';

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
