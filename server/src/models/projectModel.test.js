import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  createProject,
  getProjectResponsibility,
  listProjectsForResponsibleAdmin
} from './projectModel.js';

describe('projectModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('inserts the project with the creating Admin as responsible and returns it', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: '3', name: 'New Project', responsible_admin_id: '3' }]
      });

      const result = await createProject('New Project', 3);

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO projects \(name, responsible_admin_id\)/);
      expect(sql).toMatch(/RETURNING id, name, responsible_admin_id/);
      expect(params).toEqual(['New Project', 3]);
      expect(result).toEqual({ id: '3', name: 'New Project', responsible_admin_id: '3' });
    });

    it('passes values as bound parameters, never interpolated into the SQL', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: '4', name: "x'); DROP TABLE projects;--" }] });

      await createProject("x'); DROP TABLE projects;--", 3);

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).not.toMatch(/DROP TABLE/);
      expect(params[0]).toBe("x'); DROP TABLE projects;--");
    });

    it('writes the project and its owner in a single statement and creates no board rows', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: '5', name: 'P', responsible_admin_id: '3' }] });

      await createProject('P', 3);

      // One statement: the project and its responsible Admin are saved
      // together or not at all, and nothing else (no sprints, no PBIs) is
      // created - the board starts empty.
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toMatch(/sprints|product_backlog_items|tasks/);
    });

    it('propagates a database failure instead of swallowing it', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(createProject('P', 3)).rejects.toThrow('connection refused');
    });
  });

  describe('getProjectResponsibility', () => {
    it('returns null when the project does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await getProjectResponsibility(999, 3);

      expect(result).toBeNull();
    });

    it('returns isResponsible true when the Admin is responsible for the project', async () => {
      pool.query.mockResolvedValue({ rows: [{ is_responsible: true }] });

      const result = await getProjectResponsibility(1, 3);

      expect(result).toEqual({ isResponsible: true });
    });

    it('returns isResponsible false when a different Admin, or nobody, is responsible', async () => {
      pool.query.mockResolvedValue({ rows: [{ is_responsible: false }] });

      const result = await getProjectResponsibility(2, 3);

      expect(result).toEqual({ isResponsible: false });
    });

    it('compares ids in SQL, scoped to the given project, with an unowned project reading as false', async () => {
      pool.query.mockResolvedValue({ rows: [{ is_responsible: false }] });

      await getProjectResponsibility(2, '3');

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/COALESCE\(responsible_admin_id = \$2, false\)/);
      expect(sql).toMatch(/WHERE id = \$1/);
      expect(params).toEqual([2, '3']);
    });

    it('propagates a database failure instead of swallowing it', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(getProjectResponsibility(1, 3)).rejects.toThrow('connection refused');
    });
  });

  describe('listProjectsForResponsibleAdmin (US-04c)', () => {
    it('returns the projects whose responsible_admin_id is the given Admin, as id and name only', async () => {
      pool.query.mockResolvedValue({
        rows: [
          { id: '1', name: 'BIX Platform' },
          { id: '3', name: 'US-04d Validation Project' }
        ]
      });

      const result = await listProjectsForResponsibleAdmin('3');

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/SELECT id, name\s+FROM projects/);
      expect(sql).toMatch(/WHERE responsible_admin_id = \$1/);
      expect(sql).toMatch(/ORDER BY id/);
      expect(params).toEqual(['3']);
      expect(result).toEqual([
        { id: '1', name: 'BIX Platform' },
        { id: '3', name: 'US-04d Validation Project' }
      ]);
    });

    it('scopes by responsibility only, never by project membership', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await listProjectsForResponsibleAdmin('3');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toMatch(/project_members/);
    });

    it('returns an empty list when the Admin is responsible for no projects', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await listProjectsForResponsibleAdmin('7');

      expect(result).toEqual([]);
    });

    it('propagates a database failure instead of swallowing it', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(listProjectsForResponsibleAdmin('3')).rejects.toThrow('connection refused');
    });
  });
});
