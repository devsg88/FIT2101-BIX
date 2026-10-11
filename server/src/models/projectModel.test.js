import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  createProject,
  getProjectResponsibility,
  listProjectsForResponsibleAdmin,
  updateProjectName,
  deleteEmptyProject,
  setCurrentFocus
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

  describe('updateProjectName (US-04c)', () => {
    it('updates only the name of the given project and returns the row', async () => {
      const row = { id: '1', name: 'BIX Platform v2', responsible_admin_id: '3' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await updateProjectName(1, 'BIX Platform v2');

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE projects\s+SET name = \$1\s+WHERE id = \$2/);
      expect(sql).toMatch(/RETURNING id, name, responsible_admin_id/);
      expect(sql).not.toMatch(/responsible_admin_id\s*=/);
      expect(params).toEqual(['BIX Platform v2', 1]);
      expect(result).toEqual(row);
    });

    it('returns null when no project matched', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await updateProjectName(999, 'Anything');

      expect(result).toBeNull();
    });

    it('propagates a database failure instead of swallowing it', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(updateProjectName(1, 'P')).rejects.toThrow('connection refused');
    });
  });

  describe('deleteEmptyProject (US-04c)', () => {
    // A fake transaction client: answers each statement by its SQL, and
    // records every statement it was given in order.
    // pbis / sprints: how many of each the project has. The work check is
    // answered from the SQL itself, so a table only counts if the query
    // actually looks at it.
    function fakeClient({ found = true, pbis = 0, sprints = 0, deleteError = null } = {}) {
      const client = {
        release: vi.fn(),
        query: vi.fn(async (sql) => {
          if (/FOR UPDATE/.test(sql)) {
            return { rows: found ? [{ id: '5' }] : [] };
          }
          if (/EXISTS/.test(sql)) {
            const hasWork =
              (pbis > 0 && /FROM product_backlog_items WHERE project_id = \$1/.test(sql)) ||
              (sprints > 0 && /FROM sprints WHERE project_id = \$1/.test(sql));
            return { rows: [{ has_work: hasWork }] };
          }
          if (/^DELETE/.test(sql)) {
            if (deleteError) {
              throw deleteError;
            }
            return { rowCount: 1 };
          }
          return { rows: [] }; // BEGIN / COMMIT / ROLLBACK
        })
      };
      pool.connect.mockResolvedValue(client);
      return client;
    }

    const statements = (client) => client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/).slice(0, 2).join(' '));

    it('deletes an empty project in one transaction and returns "deleted"', async () => {
      const client = fakeClient();

      const outcome = await deleteEmptyProject(5);

      expect(outcome).toBe('deleted');
      expect(pool.connect).toHaveBeenCalledTimes(1);
      expect(statements(client)).toEqual([
        'BEGIN',
        'SELECT id',
        'SELECT EXISTS',
        'DELETE FROM',
        'COMMIT'
      ]);
      const [lockSql, lockParams] = client.query.mock.calls[1];
      expect(lockSql).toMatch(/SELECT id FROM projects WHERE id = \$1 FOR UPDATE/);
      expect(lockParams).toEqual([5]);
      const [workSql, workParams] = client.query.mock.calls[2];
      expect(workSql).toMatch(/FROM product_backlog_items WHERE project_id = \$1/);
      expect(workSql).toMatch(/FROM sprints WHERE project_id = \$1/);
      expect(workParams).toEqual([5]);
      expect(client.query.mock.calls[3]).toEqual(['DELETE FROM projects WHERE id = $1', [5]]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a PBI', { pbis: 1 }],
      ['a sprint', { sprints: 1 }]
    ])('returns "has_work" and rolls back without deleting when the project has %s', async (_label, work) => {
      const client = fakeClient(work);

      const outcome = await deleteEmptyProject(1);

      expect(outcome).toBe('has_work');
      expect(statements(client)).toEqual(['BEGIN', 'SELECT id', 'SELECT EXISTS', 'ROLLBACK']);
      expect(statements(client)).not.toContain('DELETE FROM');
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('returns "not_found" and rolls back when the project does not exist', async () => {
      const client = fakeClient({ found: false });

      const outcome = await deleteEmptyProject(999);

      expect(outcome).toBe('not_found');
      expect(statements(client)).toEqual(['BEGIN', 'SELECT id', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('returns "has_work" and rolls back if the DELETE hits a foreign-key violation (23503)', async () => {
      const fkError = Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
      const client = fakeClient({ deleteError: fkError });

      const outcome = await deleteEmptyProject(5);

      expect(outcome).toBe('has_work');
      expect(statements(client)).toEqual([
        'BEGIN',
        'SELECT id',
        'SELECT EXISTS',
        'DELETE FROM',
        'ROLLBACK'
      ]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back and rethrows any other database error, still releasing the client', async () => {
      const client = fakeClient({ deleteError: Object.assign(new Error('connection lost'), { code: '08006' }) });

      await expect(deleteEmptyProject(5)).rejects.toThrow('connection lost');

      expect(statements(client)).toContain('ROLLBACK');
      expect(statements(client)).not.toContain('COMMIT');
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('never deletes project_members itself - the ON DELETE CASCADE handles them', async () => {
      const client = fakeClient();

      await deleteEmptyProject(5);

      const allSql = client.query.mock.calls.map(([sql]) => sql).join('\n');
      expect(allSql).not.toMatch(/project_members/);
      expect(allSql).not.toMatch(/DELETE FROM (product_backlog_items|sprints|tasks|sub_tasks|pbi_collaborators)/);
    });
  });

  // US-07 / SCRUM-198
  describe('setCurrentFocus', () => {
    it('sets the focus PBI and returns the updated project', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: '1', current_focus_pbi_id: '7' }] });

      const result = await setCurrentFocus(1, 7);

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE projects/);
      expect(sql).toMatch(/SET current_focus_pbi_id = \$2/);
      expect(sql).toMatch(/RETURNING id, current_focus_pbi_id/);
      expect(params).toEqual([1, 7]);
      expect(result).toEqual({ id: '1', current_focus_pbi_id: '7' });
    });

    it('only accepts a PBI from the same project', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await setCurrentFocus(1, 7);

      const [sql] = pool.query.mock.calls[0];
      expect(sql).toMatch(/FROM product_backlog_items\s+WHERE id = \$2 AND project_id = \$1/);
    });

    it('clears the focus when given null', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: '1', current_focus_pbi_id: null }] });

      const result = await setCurrentFocus(1, null);

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/\$2::bigint IS NULL/);
      expect(params).toEqual([1, null]);
      expect(result).toEqual({ id: '1', current_focus_pbi_id: null });
    });

    it('returns null when no row was updated (missing project or PBI from another project)', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      expect(await setCurrentFocus(1, 99)).toBeNull();
    });

    it('returns null when the PBI is deleted at the same moment (foreign key violation)', async () => {
      pool.query.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));

      expect(await setCurrentFocus(1, 7)).toBeNull();
    });

    it('propagates any other database failure', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(setCurrentFocus(1, 7)).rejects.toThrow('connection refused');
    });
  });
});
