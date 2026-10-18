import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../config/db.js';
import { getSprintsByProject } from './sprintModel.js';
import { getRecordedEffortByProject, getSprintAnalytics } from './analyticsModel.js';

vi.mock('../config/db.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('./sprintModel.js', () => ({ getSprintsByProject: vi.fn() }));

describe('analyticsModel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses project-scoped completed Actual Hours, never estimates or multiplying joins', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await getRecordedEffortByProject(3);
    const [sql, params] = pool.query.mock.calls[0];
    expect(params).toEqual([3]);
    expect(sql.match(/p.project_id = \$1/g)).toHaveLength(2);
    expect(sql).toContain("t.status = 'done'");
    expect(sql).toContain("u.role = 'developer'");
    expect(sql).toContain('t.actual_hours');
    expect(sql).not.toMatch(/estimated_hours|JOIN sub_tasks|JOIN pbi_collaborators/i);
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM tasks t WHERE t.pbi_id = p.id)');
    expect(sql).toContain('GROUP BY sprint_id, developer_id, developer_name');
  });

  it('reuses the Sprint list and converts PostgreSQL numeric aggregates', async () => {
    getSprintsByProject.mockResolvedValue([{ id: '5', name: 'Sprint 5' }]);
    pool.query.mockResolvedValue({ rows: [{ sprint_id: '5', developer_id: '7', developer_name: 'Dev',
      actual_hours: '3.25', recorded_items: '2', missing_actual_hours: '0' }] });
    const data = await getSprintAnalytics(3);
    expect(getSprintsByProject).toHaveBeenCalledWith(3);
    expect(data.effort[0]).toMatchObject({ actual_hours: 3.25, recorded_items: 2 });
  });

  it('propagates database failures to the controller', async () => {
    getSprintsByProject.mockResolvedValue([]);
    pool.query.mockRejectedValue(new Error('database unavailable'));
    await expect(getSprintAnalytics(3)).rejects.toThrow('database unavailable');
  });
});
