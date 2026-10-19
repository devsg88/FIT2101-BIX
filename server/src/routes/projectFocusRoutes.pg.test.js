import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../config/db.js';

// US-07 / SCRUM-200. PATCH /api/projects/:projectId/focus through the real
// app: real middleware, controller and models. Only the pg pool is faked, and
// it answers the way plain pg does - { rows: [...] } with bigint ids as
// strings - so this also checks every layer copes with pg's result shape.
vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}));

// A tiny in-memory copy of the rows these queries read.
//   Project 1: Admin 3 responsible, Developers 1 and 2 members, PBIs 1 and 2.
//   Project 2: no responsible Admin, no members, PBI 5.
function freshDb() {
  return {
    projects: [
      { id: '1', name: 'BIX Platform', responsible_admin_id: '3', current_focus_pbi_id: null },
      { id: '2', name: 'Mobile App', responsible_admin_id: null, current_focus_pbi_id: null }
    ],
    members: [
      { project_id: '1', user_id: '1' },
      { project_id: '1', user_id: '2' }
    ],
    pbis: [
      { id: '1', project_id: '1' },
      { id: '2', project_id: '1' },
      { id: '5', project_id: '2' }
    ]
  };
}

const same = (a, b) => a !== null && a !== undefined && String(a) === String(b);

// Answers each query by what it selects, the way PostgreSQL would for the
// rows above. An unexpected query fails the test loudly.
function fakePgQuery(db) {
  return async (sql, params = []) => {
    if (sql.includes('COALESCE(responsible_admin_id = $2, false)')) {
      const [projectId, adminId] = params;
      const project = db.projects.find((p) => same(p.id, projectId));
      return { rows: project ? [{ is_responsible: same(project.responsible_admin_id, adminId) }] : [] };
    }

    if (sql.includes('FROM projects WHERE id = $1')) {
      const project = db.projects.find((p) => same(p.id, params[0]));
      return { rows: project ? [{ id: project.id, name: project.name, current_focus_pbi_id: project.current_focus_pbi_id }] : [] };
    }

    if (sql.includes('FROM project_members WHERE project_id = $1 AND user_id = $2')) {
      const [projectId, userId] = params;
      const found = db.members.some((m) => same(m.project_id, projectId) && same(m.user_id, userId));
      return { rows: found ? [{ '?column?': 1 }] : [] };
    }

    if (sql.includes('SET current_focus_pbi_id = $2')) {
      const [projectId, pbiId] = params;
      const project = db.projects.find((p) => same(p.id, projectId));
      const pbiInProject = db.pbis.some((p) => same(p.id, pbiId) && same(p.project_id, projectId));
      if (!project || (pbiId !== null && !pbiInProject)) {
        return { rows: [] };
      }
      project.current_focus_pbi_id = pbiId === null ? null : String(pbiId);
      return { rows: [{ id: project.id, current_focus_pbi_id: project.current_focus_pbi_id }] };
    }

    throw new Error(`Unexpected query in test: ${sql}`);
  };
}

describe('PATCH /api/projects/:projectId/focus with a plain pg pool (US-07)', () => {
  const TEST_SECRET = 'project-focus-pg-test-secret';
  const admin = { id: '3', role: 'admin' };
  const developer = { id: '2', role: 'developer' };
  let server;
  let baseUrl;
  let originalSecret;
  let db;

  function setFocus(projectId, user, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/focus`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body)
    });
  }

  beforeAll(async () => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db = freshDb();
    pool.query.mockImplementation(fakePgQuery(db));
  });

  describe('200 - success', () => {
    it('lets the responsible Admin set a PBI from the project', async () => {
      const res = await setFocus(1, admin, { pbi_id: 2 });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ project: { id: '1', current_focus_pbi_id: '2' } });
      expect(db.projects[0].current_focus_pbi_id).toBe('2');
    });

    it('lets a Developer member set a PBI from the project', async () => {
      const res = await setFocus(1, developer, { pbi_id: 1 });

      expect(res.status).toBe(200);
      expect(db.projects[0].current_focus_pbi_id).toBe('1');
    });

    it('clears the focus when pbi_id is null', async () => {
      db.projects[0].current_focus_pbi_id = '1';

      const res = await setFocus(1, admin, { pbi_id: null });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ project: { id: '1', current_focus_pbi_id: null } });
      expect(db.projects[0].current_focus_pbi_id).toBeNull();
    });

    it('sends the ids to pg as bound parameters', async () => {
      await setFocus(1, admin, { pbi_id: 2 });

      const update = pool.query.mock.calls.find(([sql]) => sql.includes('SET current_focus_pbi_id'));
      expect(update[1]).toEqual([1, 2]);
    });
  });

  describe('403 - blocked by requireProjectAccess', () => {
    it('blocks a Developer who is not a member of the project', async () => {
      const outsider = { id: '9', role: 'developer' };

      const res = await setFocus(1, outsider, { pbi_id: 1 });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ message: 'You are not a member of this project' });
      expect(db.projects[0].current_focus_pbi_id).toBeNull();
    });

    it('blocks an Admin who is not responsible for the project', async () => {
      const res = await setFocus(2, admin, { pbi_id: 5 });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ message: 'You are not responsible for this project' });
      expect(db.projects[1].current_focus_pbi_id).toBeNull();
    });

    it('never runs the update for a blocked user', async () => {
      await setFocus(1, { id: '9', role: 'developer' }, { pbi_id: 1 });

      const ranUpdate = pool.query.mock.calls.some(([sql]) => sql.includes('SET current_focus_pbi_id'));
      expect(ranUpdate).toBe(false);
    });
  });

  describe('400 / 404 - bad or unknown PBI', () => {
    it('returns 404 for a PBI id that does not exist', async () => {
      const res = await setFocus(1, admin, { pbi_id: 999 });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: 'PBI not found in this project' });
      expect(db.projects[0].current_focus_pbi_id).toBeNull();
    });

    it('returns 404 for a PBI that belongs to a different project', async () => {
      // PBI 5 is in project 2.
      const res = await setFocus(1, developer, { pbi_id: 5 });

      expect(res.status).toBe(404);
      expect(db.projects[0].current_focus_pbi_id).toBeNull();
    });

    it('returns 404 for a project that does not exist', async () => {
      const res = await setFocus(42, admin, { pbi_id: 1 });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: 'Project not found' });
    });

    it.each([
      ['missing', {}],
      ['a string', { pbi_id: '2' }],
      ['zero', { pbi_id: 0 }]
    ])('returns 400 when pbi_id is %s, and leaves the focus unchanged', async (_label, body) => {
      db.projects[0].current_focus_pbi_id = '1';

      const res = await setFocus(1, admin, body);

      expect(res.status).toBe(400);
      expect(db.projects[0].current_focus_pbi_id).toBe('1');
    });
  });

  it('returns 401 with no token', async () => {
    const res = await setFocus(1, null, { pbi_id: 1 });

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
