import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../config/db.js';
import { createTask, updateTask, createSubTask, updateSubTask, getSubTasksByPbi } from './taskModel.js';

vi.mock('../config/db.js', () => ({ pool: { query: vi.fn() } }));

describe('Sprint Planning persistence', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([createTask, updateTask, createSubTask, updateSubTask])(
    '%s locks and checks the project-scoped parent in the same statement as the write',
    async (write) => {
      const row = { id: '3', description: 'Details' };
      pool.query.mockResolvedValue({ rows: [row] });
      expect(await write(7, 10, { title: 'Work', description: 'Details' })).toEqual(row);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/FOR UPDATE/);
      expect(sql).toMatch(/project_id = \$1/);
      expect(sql).toMatch(/stage = 'sprint_planning'/);
      expect(params).toEqual([7, 10, 'Work', 'Details']);
      expect(pool.query).toHaveBeenCalledOnce();
      expect(sql).not.toMatch(/DELETE|INSERT INTO product_backlog_items/i);
    }
  );

  it.each([updateTask, updateSubTask])('%s edits only title and description', async (write) => {
    pool.query.mockResolvedValue({ rows: [] });
    expect(await write(7, 10, { title: 'Work', description: null })).toBeNull();
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SET title = \$3, description = \$4/);
    expect(sql).not.toMatch(/SET (status|pbi_id|task_id|assignee_id|actual_hours)/);
  });

  it('reads sub-tasks through the requested PBI and project', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: '3', task_id: '2' }] });
    expect(await getSubTasksByPbi(7, 10)).toEqual([{ id: '3', task_id: '2' }]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('p.project_id = $1 AND p.id = $2'), [7, 10]);
  });
});
