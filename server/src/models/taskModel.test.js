import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../config/db.js';
import {
  createTask, updateTask, createSubTask, updateSubTask, getSubTasksByPbi,
  getTaskInPbi, updateTaskInPbi, deleteTask, assignTask
} from './taskModel.js';

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

describe('getTaskInPbi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the SELECT to both id and pbi_id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, pbi_id: 2 }] });

    await getTaskInPbi(2, 1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT/i);
    expect(sql).toMatch(/FROM tasks/i);
    expect(sql).toMatch(/WHERE id = \$1 AND pbi_id = \$2/i);
    expect(params).toEqual([1, 2]);
  });

  it('returns null when no row matches', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await getTaskInPbi(2, 999);

    expect(result).toBeNull();
  });
});

describe('updateTaskInPbi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes title and status only, scoped to id and pbi_id', async () => {
    const updatedRow = { id: 1, pbi_id: 2, title: 'New title', status: 'in_progress', assignee_id: null };
    pool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await updateTaskInPbi(2, 1, { title: 'New title', status: 'in_progress' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE tasks/i);
    expect(sql).toMatch(/SET title = \$1,\s*status = \$2/i);
    // assignee_id may legitimately appear in the RETURNING list (the full
    // row is read back), just not in the SET clause - that's assignTask's
    // job, not updateTask's.
    expect(sql).not.toMatch(/SET[^;]*assignee_id\s*=/i);
    expect(sql).toMatch(/WHERE id = \$3 AND pbi_id = \$4/i);
    expect(params).toEqual(['New title', 'in_progress', 1, 2]);
    expect(result).toEqual(updatedRow);
  });

  it('returns null when the task does not belong to that pbi', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await updateTaskInPbi(999, 1, { title: 'x', status: 'todo' });

    expect(result).toBeNull();
  });
});

describe('deleteTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes exactly one row scoped to id and pbi_id, and reports success', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });

    const result = await deleteTask(2, 1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM tasks/i);
    expect(sql).toMatch(/WHERE id = \$1 AND pbi_id = \$2/i);
    expect(params).toEqual([1, 2]);
    expect(result).toBe(true);
  });

  it('returns false when nothing matched', async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    const result = await deleteTask(2, 999);

    expect(result).toBe(false);
  });
});

describe('assignTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes assignee_id only, scoped to id and pbi_id', async () => {
    const updatedRow = { id: 1, pbi_id: 2, title: 'x', status: 'todo', assignee_id: 5 };
    pool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await assignTask(2, 1, 5);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE tasks/i);
    expect(sql).toMatch(/SET assignee_id = \$1/i);
    expect(sql).not.toMatch(/SET title/i);
    expect(sql).toMatch(/WHERE id = \$2 AND pbi_id = \$3/i);
    expect(params).toEqual([5, 1, 2]);
    expect(result).toEqual(updatedRow);
  });

  it('accepts null to unassign', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, pbi_id: 2, assignee_id: null }] });

    await assignTask(2, 1, null);

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([null, 1, 2]);
  });
});
