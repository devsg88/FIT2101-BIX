import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../config/db.js';

// US-09 / SCRUM-177. PATCH /api/projects/:projectId/sprints/:sprintId/roles
// through the real app: real middleware, controller and models. Only the pg
// pool is faked, answering the way plain pg does ({ rows }, bigint ids as
// strings). This proves AC4 end to end: the users table really is queried,
// and an unknown user is refused before anything is written.
vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}));

// Matches seed.sql:
//   Users 1 and 2 are Developers, user 3 is the Admin.
//   Project 1: Admin 3 responsible, Developers 1 and 2 members, sprint 3.
//   Project 2: no responsible Admin, no members, sprint 9.
function freshDb() {
  return {
    users: [
      { id: '1', name: 'Pang', email: 'pang@bix.app', role: 'developer' },
      { id: '2', name: 'Developer', email: 'developer@bix.app', role: 'developer' },
      { id: '3', name: 'Admin', email: 'admin@bix.app', role: 'admin' }
    ],
    projects: [
      { id: '1', name: 'BIX Platform', responsible_admin_id: '3' },
      { id: '2', name: 'Mobile App', responsible_admin_id: null }
    ],
    members: [
      { project_id: '1', user_id: '1' },
      { project_id: '1', user_id: '2' }
    ],
    sprints: [
      { id: '3', project_id: '1', name: 'Sprint 3', status: 'planning', scrum_master_id: null, product_owner_identifier: null },
      { id: '9', project_id: '2', name: 'Mobile Sprint', status: 'planning', scrum_master_id: null, product_owner_identifier: null }
    ]
  };
}

const same = (a, b) => a !== null && a !== undefined && String(a) === String(b);

function fakePgQuery(db) {
  return async (sql, params = []) => {
    if (sql.includes('COALESCE(responsible_admin_id = $2, false)')) {
      const [projectId, adminId] = params;
      const project = db.projects.find((p) => same(p.id, projectId));
      return { rows: project ? [{ is_responsible: same(project.responsible_admin_id, adminId) }] : [] };
    }

    if (sql.includes('FROM projects WHERE id = $1')) {
      const project = db.projects.find((p) => same(p.id, params[0]));
      return { rows: project ? [{ id: project.id, name: project.name }] : [] };
    }

    if (sql.includes('FROM project_members WHERE project_id = $1 AND user_id = $2')) {
      const [projectId, userId] = params;
      const found = db.members.some((m) => same(m.project_id, projectId) && same(m.user_id, userId));
      return { rows: found ? [{ '?column?': 1 }] : [] };
    }

    if (sql.includes('FROM users WHERE id = $1')) {
      const user = db.users.find((u) => same(u.id, params[0]));
      return { rows: user ? [{ ...user }] : [] };
    }

    if (sql.includes('UPDATE sprints')) {
      const [projectId, sprintId, hasSm, smId, hasPo, po] = params;
      const sprint = db.sprints.find((s) => same(s.id, sprintId) && same(s.project_id, projectId));
      if (!sprint) {
        return { rows: [] };
      }
      if (hasSm) sprint.scrum_master_id = smId === null ? null : String(smId);
      if (hasPo) sprint.product_owner_identifier = po;
      return { rows: [{ ...sprint }] };
    }

    if (sql.includes('FROM sprints')) {
      const [projectId, sprintId] = params;
      const sprint = db.sprints.find((s) => same(s.id, sprintId) && same(s.project_id, projectId));
      return { rows: sprint ? [{ ...sprint }] : [] };
    }

    throw new Error(`Unexpected query in test: ${sql}`);
  };
}

describe('PATCH /api/projects/:projectId/sprints/:sprintId/roles with a plain pg pool (US-09)', () => {
  const TEST_SECRET = 'sprint-roles-pg-test-secret';
  const admin = { id: '3', role: 'admin' };
  const developer = { id: '2', role: 'developer' };
  let server;
  let baseUrl;
  let originalSecret;
  let db;

  function setRoles(projectId, sprintId, user, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(user, TEST_SECRET, { expiresIn: '5m' })}`;
    }
    return fetch(`${baseUrl}/api/projects/${projectId}/sprints/${sprintId}/roles`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body)
    });
  }

  const sprint3 = () => db.sprints.find((s) => s.id === '3');
  const ranUpdate = () => pool.query.mock.calls.some(([sql]) => sql.includes('UPDATE sprints'));

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

  describe('200 - saved', () => {
    it('lets the responsible Admin tag a Developer member as Scrum Master, with a Product Owner', async () => {
      const res = await setRoles(1, 3, admin, {
        scrum_master_id: 1,
        product_owner_identifier: 'client@example.com'
      });

      expect(res.status).toBe(200);
      const { sprint } = await res.json();
      expect(sprint).toMatchObject({
        id: '3',
        scrum_master_id: '1',
        product_owner_identifier: 'client@example.com'
      });
      expect(sprint3().scrum_master_id).toBe('1');
    });

    it('lets a Developer member set the roles', async () => {
      const res = await setRoles(1, 3, developer, { scrum_master_id: 2 });

      expect(res.status).toBe(200);
      expect(sprint3().scrum_master_id).toBe('2');
    });

    it('accepts the responsible Admin as Scrum Master', async () => {
      const res = await setRoles(1, 3, admin, { scrum_master_id: 3 });

      expect(res.status).toBe(200);
      expect(sprint3().scrum_master_id).toBe('3');
    });

    it('clears both roles with null', async () => {
      Object.assign(sprint3(), { scrum_master_id: '1', product_owner_identifier: 'Jane' });

      const res = await setRoles(1, 3, admin, { scrum_master_id: null, product_owner_identifier: null });

      expect(res.status).toBe(200);
      expect(sprint3()).toMatchObject({ scrum_master_id: null, product_owner_identifier: null });
    });
  });

  describe('400 - AC4: no fake or outside users', () => {
    it('queries the users table and refuses an id that does not exist', async () => {
      const res = await setRoles(1, 3, admin, { scrum_master_id: 999 });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: 'The Scrum Master must be an existing user' });
      const userLookup = pool.query.mock.calls.find(([sql]) => sql.includes('FROM users WHERE id = $1'));
      expect(userLookup[1]).toEqual([999]);
      expect(ranUpdate()).toBe(false);
      expect(sprint3().scrum_master_id).toBeNull();
    });

    it('refuses a real user who is not on this project', async () => {
      // Add a Developer who exists but is not a member of project 1.
      db.users.push({ id: '4', name: 'Outsider', email: 'out@bix.app', role: 'developer' });

      const res = await setRoles(1, 3, admin, { scrum_master_id: 4 });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: 'The Scrum Master must be a member of this project' });
      expect(ranUpdate()).toBe(false);
    });

    it('refuses a Scrum Master id sent as text', async () => {
      const res = await setRoles(1, 3, admin, { scrum_master_id: '@Pang' });

      expect(res.status).toBe(400);
      expect(ranUpdate()).toBe(false);
    });
  });

  describe('404 - sprint not found', () => {
    it('returns 404 for a sprint id that does not exist', async () => {
      const res = await setRoles(1, 42, admin, { scrum_master_id: 1 });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: 'Sprint not found' });
      expect(ranUpdate()).toBe(false);
    });

    it('returns 404 for a sprint that belongs to another project', async () => {
      // Sprint 9 is in project 2.
      const res = await setRoles(1, 9, developer, { product_owner_identifier: 'Jane' });

      expect(res.status).toBe(404);
      expect(db.sprints.find((s) => s.id === '9').product_owner_identifier).toBeNull();
    });
  });

  describe('blocked by requireProjectAccess', () => {
    it('returns 403 to a Developer who is not a member', async () => {
      const res = await setRoles(1, 3, { id: '9', role: 'developer' }, { scrum_master_id: 1 });

      expect(res.status).toBe(403);
      expect(ranUpdate()).toBe(false);
    });

    it('returns 403 to an Admin not responsible for the project', async () => {
      const res = await setRoles(2, 9, admin, { product_owner_identifier: 'Jane' });

      expect(res.status).toBe(403);
      expect(ranUpdate()).toBe(false);
    });

    it('returns 401 with no token', async () => {
      const res = await setRoles(1, 3, null, { scrum_master_id: 1 });

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });
});
