import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../config/db.js';
import { getSprintsByProject } from './sprintModel.js';
import { listProjectsForResponsibleAdmin } from './projectModel.js';
import { getRecordedEffortByProject, getSprintAnalytics, getProjectAnalytics } from './analyticsModel.js';

vi.mock('../config/db.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('./sprintModel.js', () => ({ getSprintsByProject: vi.fn() }));
vi.mock('./projectModel.js', () => ({ listProjectsForResponsibleAdmin: vi.fn() }));

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

describe('Project analytics aggregation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('scopes both completed-work sources by admin responsibility in SQL', async () => {
    listProjectsForResponsibleAdmin.mockResolvedValue([]);
    pool.query.mockResolvedValue({ rows: [] });
    await getProjectAnalytics(7);
    const [sql, params] = pool.query.mock.calls[0];
    expect(params).toEqual([7]);
    expect(sql.match(/pr.responsible_admin_id = \$1/g)).toHaveLength(2);
    expect(sql).toContain('pr.id = p.project_id');
    expect(sql).toContain('GROUP BY project_id, developer_id, developer_name');
    expect(sql).not.toMatch(/estimated_hours|JOIN sub_tasks|JOIN pbi_collaborators|sprint_id IS NOT NULL/i);
    expect(listProjectsForResponsibleAdmin).toHaveBeenCalledWith(7);
    expect(getSprintsByProject).not.toHaveBeenCalled();
  });

  it('reads all responsible projects in one effort query and reuses the response builder', async () => {
    listProjectsForResponsibleAdmin.mockResolvedValue([{ id: '1', name: 'Platform' }, { id: '2', name: 'Mobile' }]);
    pool.query.mockResolvedValue({ rows: [{ project_id: '2', developer_id: '8', developer_name: 'Developer',
      actual_hours: '3.75', recorded_items: '2', missing_actual_hours: '1' }] });
    const data = await getProjectAnalytics(7);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(data.projects).toHaveLength(2);
    expect(data.effort[0]).toMatchObject({ project_id: '2', actual_hours: 3.75, missing_actual_hours: 1 });
  });

  it('does not surface totals outside the responsible-project dimensions', async () => {
    listProjectsForResponsibleAdmin.mockResolvedValue([]);
    pool.query.mockResolvedValue({ rows: [{ project_id: '99', developer_id: '8', developer_name: 'Private',
      actual_hours: '5', recorded_items: '1', missing_actual_hours: '0' }] });
    expect(await getProjectAnalytics(7)).toEqual({ projects: [], developers: [], effort: [], unattributed: [] });
  });

  it('propagates an aggregation failure', async () => {
    listProjectsForResponsibleAdmin.mockResolvedValue([]);
    pool.query.mockRejectedValue(new Error('database unavailable'));
    await expect(getProjectAnalytics(7)).rejects.toThrow('database unavailable');
  });
});
