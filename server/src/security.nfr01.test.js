import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import app from './app.js';
import { getProjectById, getBoard } from './models/boardModel.js';
import { isProjectMember } from './models/projectMembershipModel.js';
import {
  getProjectResponsibility,
  listProjectsForResponsibleAdmin,
  createProject
} from './models/projectModel.js';
import { getPbisByProject } from './models/pbiModel.js';
import { getCompletedWorkByProject } from './models/completedWorkModel.js';
import { getSprintsByProject } from './models/sprintModel.js';
import { getBurndownData } from './models/burndownModel.js';

// NFR-01 - Security & Authorisation Baseline, T1.X "Testing".
//
// This file is the single evidence suite for the ticket's own checklist: each
// `describe` block below is named after one of its "Areas to test" /
// "Minimum scenarios" bullets, end to end, against the REAL app (a listening
// HTTP server, the real `jsonwebtoken` library, nothing mocked except the
// database layer) - not the individual middleware unit tests elsewhere
// (authMiddleware.test.js) or the exhaustive per-route coverage already in
// boardActionRoutes.access.test.js / pbiRoutes.access.test.js /
// taskRoutes.responsibility.test.js / projectRoutes.test.js. Those remain the
// authoritative, exhaustive coverage per route; this file exists so a
// reviewer can see every scenario the ticket lists satisfied in one place,
// against one representative endpoint per "area" rather than reopening ten
// files to piece the picture together.
//
// "Analytics" is listed in the ticket's "representative protected areas" but
// no such feature/route exists in this codebase yet (dashboardController's
// admin view is just a team count, not a protected per-project analytics
// endpoint) - there is nothing to test here until that feature exists. Noted
// rather than silently skipped.

vi.mock('./models/boardModel.js');
vi.mock('./models/projectMembershipModel.js');
vi.mock('./models/projectModel.js');
vi.mock('./models/pbiModel.js');
vi.mock('./models/completedWorkModel.js');
vi.mock('./models/sprintModel.js');
vi.mock('./models/burndownModel.js');

const TEST_SECRET = 'nfr01-security-test-secret';
const ADMIN = { id: '10', role: 'admin' };
const DEVELOPER = { id: '20', role: 'developer' };

let server;
let baseUrl;
let originalSecret;

function tokenFor(payload, options = {}) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '5m', ...options });
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function request(path, { token, method = 'GET', body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token)
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

// One representative, already-mounted protected endpoint per "area" the
// ticket names. Each is GET-only and needs no request body, so the 401 sweep
// below can hit all of them the same way.
const PROTECTED_AREAS = [
  { label: 'Project Board', path: '/api/projects/1/board' },
  { label: 'PBIs', path: '/api/projects/1/pbis' },
  { label: 'Work History', path: '/api/projects/1/completed-work' },
  { label: 'Burndown (Sprint list)', path: '/api/projects/1/sprints' },
  { label: 'project/team management (list projects)', path: '/api/projects' }
];

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
  getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
});

describe('1. Unauthenticated access to protected pages/APIs returns 401', () => {
  it.each(PROTECTED_AREAS)('$label rejects a request with no token', async ({ path }) => {
    const res = await request(path);

    expect(res.status).toBe(401);
    expect(getBoard).not.toHaveBeenCalled();
    expect(getPbisByProject).not.toHaveBeenCalled();
    expect(getCompletedWorkByProject).not.toHaveBeenCalled();
  });
});

describe('2. Authorised Admin can access what their role permits', () => {
  it('the responsible Admin reaches the Board', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getBoard.mockResolvedValue({ project: { id: 1, name: 'BIX Platform' }, sprints: [], pbis: [] });

    const res = await request('/api/projects/1/board', { token: tokenFor(ADMIN) });

    expect(res.status).toBe(200);
    expect(isProjectMember).not.toHaveBeenCalled();
  });

  it('the responsible Admin reaches the PBI list (admin-only route)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getPbisByProject.mockResolvedValue([]);

    const res = await request('/api/projects/1/pbis', { token: tokenFor(ADMIN) });

    expect(res.status).toBe(200);
  });
});

describe('3. Authorised Developer can access what their role permits', () => {
  it('an assigned Developer reaches the Board via project membership, not responsibility', async () => {
    isProjectMember.mockResolvedValue(true);
    getBoard.mockResolvedValue({ project: { id: 1, name: 'BIX Platform' }, sprints: [], pbis: [] });

    const res = await request('/api/projects/1/board', { token: tokenFor(DEVELOPER) });

    expect(res.status).toBe(200);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
  });
});

describe('4. Admin-only actions reject non-admin (wrong-role) users with 403', () => {
  it('a Developer who IS a member of the project is still refused the admin-only PBI list', async () => {
    // Deliberately membership = true: this proves the rejection is about
    // role, not project access - a Developer on the project still cannot
    // use an Admin-only endpoint.
    isProjectMember.mockResolvedValue(true);

    const res = await request('/api/projects/1/pbis', { token: tokenFor(DEVELOPER) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(getPbisByProject).not.toHaveBeenCalled();
    expect(isProjectMember).not.toHaveBeenCalled(); // requireRole rejects before any DB check
    expect(body.message).toMatch(/permission/i);
  });

  it('a Developer cannot create a project (admin-only, project/team management area)', async () => {
    const res = await request('/api/projects', {
      token: tokenFor(DEVELOPER),
      method: 'POST',
      body: { name: 'Shadow Project' }
    });

    expect(res.status).toBe(403);
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe('5. Developers cannot access projects they are not assigned to, even by direct URL/API request', () => {
  it('returns 403 for the Board, not the project data, when the Developer is not a member', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await request('/api/projects/1/board', { token: tokenFor(DEVELOPER) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(getBoard).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty('project');
    expect(body).not.toHaveProperty('pbis');
  });

  it('returns 403 for Work History when the Developer is not a member', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await request('/api/projects/1/completed-work', { token: tokenFor(DEVELOPER) });

    expect(res.status).toBe(403);
    expect(getCompletedWorkByProject).not.toHaveBeenCalled();
  });

  it('returns 403 for Burndown Sprints when the Developer is not a member', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await request('/api/projects/1/sprints', { token: tokenFor(DEVELOPER) });

    expect(res.status).toBe(403);
    expect(getSprintsByProject).not.toHaveBeenCalled();
  });
});

describe('6. Project/admin responsibility restrictions are enforced', () => {
  it('an Admin who is not responsible for this project is refused the Board, never consulting membership', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await request('/api/projects/1/board', { token: tokenFor(ADMIN) });

    expect(res.status).toBe(403);
    expect(isProjectMember).not.toHaveBeenCalled();
    expect(getBoard).not.toHaveBeenCalled();
  });

  it('an Admin who is not responsible for this project is refused the PBI list (admin-only + responsibility)', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });

    const res = await request('/api/projects/1/pbis', { token: tokenFor(ADMIN) });

    expect(res.status).toBe(403);
    expect(getPbisByProject).not.toHaveBeenCalled();
  });

  it('a project that does not exist returns 404, not 403 or 500, for either role', async () => {
    // Two separate model functions back the two roles' checks
    // (requireProjectMembership uses boardModel.getProjectById;
    // requireProjectResponsibility uses its own projectModel query) - both
    // need to agree the project is gone for this to be a fair test of each
    // path, not just the Developer one.
    getProjectById.mockResolvedValue(null);
    getProjectResponsibility.mockResolvedValue(null);

    const asDeveloper = await request('/api/projects/999/board', { token: tokenFor(DEVELOPER) });
    const asAdmin = await request('/api/projects/999/board', { token: tokenFor(ADMIN) });

    expect(asDeveloper.status).toBe(404);
    expect(asAdmin.status).toBe(404);
  });
});

describe('7. Removing a user from a project, or changing their role, updates access correctly', () => {
  it('a Developer who loses project membership is denied on the very next request - no caching', async () => {
    const token = tokenFor(DEVELOPER);

    isProjectMember.mockResolvedValueOnce(true);
    getBoard.mockResolvedValue({ project: { id: 1, name: 'BIX Platform' }, sprints: [], pbis: [] });
    const whileAssigned = await request('/api/projects/1/board', { token });
    expect(whileAssigned.status).toBe(200);

    // Same user, same still-valid token - only their membership changed.
    isProjectMember.mockResolvedValueOnce(false);
    const afterRemoval = await request('/api/projects/1/board', { token });
    expect(afterRemoval.status).toBe(403);
  });

  it("an Admin who stops being a project's responsible Admin is denied on the very next request", async () => {
    const token = tokenFor(ADMIN);

    getProjectResponsibility.mockResolvedValueOnce({ isResponsible: true });
    getBoard.mockResolvedValue({ project: { id: 1, name: 'BIX Platform' }, sprints: [], pbis: [] });
    const whileResponsible = await request('/api/projects/1/board', { token });
    expect(whileResponsible.status).toBe(200);

    getProjectResponsibility.mockResolvedValueOnce({ isResponsible: false });
    const afterReassignment = await request('/api/projects/1/board', { token });
    expect(afterReassignment.status).toBe(403);
  });

  it('a role change from developer to admin is reflected immediately (a new token carries the new role)', async () => {
    // Role lives in the JWT payload (see authController.js), so this models
    // the real flow: the old developer-role token stays a developer until
    // the user logs in again and gets a token with role: 'admin'. Swapping
    // membership for responsibility between the two calls proves the second
    // request is evaluated under the NEW role's rule, not the old one.
    isProjectMember.mockResolvedValue(true);
    getBoard.mockResolvedValue({ project: { id: 1, name: 'BIX Platform' }, sprints: [], pbis: [] });
    const asDeveloper = await request('/api/projects/1/board', { token: tokenFor(DEVELOPER) });
    expect(asDeveloper.status).toBe(200);
    expect(getProjectResponsibility).not.toHaveBeenCalled();

    vi.clearAllMocks();
    getProjectById.mockResolvedValue({ id: 1, name: 'BIX Platform' });
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    getBoard.mockResolvedValue({ project: { id: 1, name: 'BIX Platform' }, sprints: [], pbis: [] });
    const asAdmin = await request('/api/projects/1/board', { token: tokenFor(ADMIN) });
    expect(asAdmin.status).toBe(200);
    expect(isProjectMember).not.toHaveBeenCalled();
  });
});

describe('8. Invalid/expired token', () => {
  it('rejects a genuinely expired token (not mocked - real jsonwebtoken expiry)', async () => {
    const expired = tokenFor(DEVELOPER, { expiresIn: '-10s' });

    const res = await request('/api/projects/1/board', { token: expired });

    expect(res.status).toBe(401);
    expect(getBoard).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the wrong secret (forged/tampered)', async () => {
    const forged = jwt.sign(ADMIN, 'not-the-real-secret', { expiresIn: '5m' });

    const res = await request('/api/projects/1/board', { token: forged });

    expect(res.status).toBe(401);
  });

  it('rejects a malformed token string', async () => {
    const res = await request('/api/projects/1/board', { token: 'not.a.real.jwt' });

    expect(res.status).toBe(401);
  });

  it('rejects a request with no Authorization header at all', async () => {
    const res = await fetch(`${baseUrl}/api/projects/1/board`);

    expect(res.status).toBe(401);
  });
});

describe('9. Denied requests must not expose protected data, stack traces, database details or other internal information', () => {
  it('a 403 response body contains only a short message, nothing else', async () => {
    isProjectMember.mockResolvedValue(false);

    const res = await request('/api/projects/1/board', { token: tokenFor(DEVELOPER) });
    const body = await res.json();

    expect(Object.keys(body)).toEqual(['message']);
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeLessThan(200);
  });

  it('a 401 response body contains only a short message, nothing else', async () => {
    const res = await request('/api/projects/1/board', { token: 'garbage' });
    const body = await res.json();

    expect(Object.keys(body)).toEqual(['message']);
  });

  it('a database failure returns a generic 500 message, never the raw error', async () => {
    isProjectMember.mockResolvedValue(true);
    getBoard.mockRejectedValue(
      new Error('relation "product_backlog_items" does not exist, column pbi.sekret_internal_col')
    );

    const res = await request('/api/projects/1/board', { token: tokenFor(DEVELOPER) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).not.toMatch(/relation|column|sekret_internal_col|product_backlog_items/);
    expect(Object.keys(body)).toEqual(['message']);
  });

  it('a malformed JSON request body does not leak a stack trace or HTML error page', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not valid json'
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toMatch(/application\/json/);
    const text = await res.text();
    expect(text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // a stack trace frame
    expect(text.toLowerCase()).not.toMatch(/<html|syntaxerror|node_modules/);
  });
});
