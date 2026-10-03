import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  getSubTaskById,
  updateSubTask,
  deleteSubTask,
  deleteSubTasksByTaskId,
  assignSubTask
} from './subTaskModel.js';

describe('getSubTaskById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the SELECT to both id and task_id', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, task_id: 4 }] });

    await getSubTaskById(4, 1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM sub_tasks/i);
    expect(sql).toMatch(/WHERE id = \$1 AND task_id = \$2/i);
    expect(params).toEqual([1, 4]);
  });

  it('returns null when no row matches', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await getSubTaskById(4, 999)).toBeNull();
  });
});

describe('updateSubTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes title and status only, scoped to id and task_id', async () => {
    const updatedRow = { id: 1, task_id: 4, title: 'New', status: 'done', assignee_id: null };
    pool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await updateSubTask(4, 1, { title: 'New', status: 'done' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE sub_tasks/i);
    expect(sql).toMatch(/SET title = \$1,\s*status = \$2/i);
    // assignee_id may legitimately appear in the RETURNING list (the full
    // row is read back), just not in the SET clause - see the identical
    // comment in taskModel.test.js.
    expect(sql).not.toMatch(/SET[^;]*assignee_id\s*=/i);
    expect(sql).toMatch(/WHERE id = \$3 AND task_id = \$4/i);
    expect(params).toEqual(['New', 'done', 1, 4]);
    expect(result).toEqual(updatedRow);
  });
});

describe('deleteSubTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes exactly one row scoped to id and task_id, and reports success', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });

    const result = await deleteSubTask(4, 1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM sub_tasks/i);
    expect(sql).toMatch(/WHERE id = \$1 AND task_id = \$2/i);
    expect(params).toEqual([1, 4]);
    expect(result).toBe(true);
  });

  it('returns false when nothing matched', async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    expect(await deleteSubTask(4, 999)).toBe(false);
  });
});

describe('deleteSubTasksByTaskId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes every sub-task under one task, scoped to task_id only', async () => {
    pool.query.mockResolvedValue({ rowCount: 2 });

    await deleteSubTasksByTaskId(4);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM sub_tasks WHERE task_id = \$1/i);
    expect(params).toEqual([4]);
  });
});

describe('assignSubTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes assignee_id only, scoped to id and task_id', async () => {
    const updatedRow = { id: 1, task_id: 4, title: 'x', status: 'todo', assignee_id: 5 };
    pool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await assignSubTask(4, 1, 5);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE sub_tasks/i);
    expect(sql).toMatch(/SET assignee_id = \$1/i);
    expect(sql).toMatch(/WHERE id = \$2 AND task_id = \$3/i);
    expect(params).toEqual([5, 1, 4]);
    expect(result).toEqual(updatedRow);
  });

  it('accepts null to unassign', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, task_id: 4, assignee_id: null }] });

    await assignSubTask(4, 1, null);

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([null, 1, 4]);
  });
});
