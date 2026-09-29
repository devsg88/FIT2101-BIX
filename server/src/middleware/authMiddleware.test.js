import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireAuth,
  requireRole,
  requireProjectMembership,
  requireProjectResponsibility
} from './authMiddleware.js';
import jwt from 'jsonwebtoken';
import { getProjectResponsibility } from '../models/projectModel.js';

vi.mock('jsonwebtoken');
vi.mock('../models/projectModel.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the Authorization header is missing', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token cannot be verified', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });
    const req = { headers: { authorization: 'Bearer nope' } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user from the verified payload and calls next', () => {
    jwt.verify.mockReturnValue({ id: 1, role: 'developer' });
    const req = { headers: { authorization: 'Bearer good' } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.user).toEqual({ id: 1, role: 'developer' });
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when authentication has not run (no req.user)', () => {
    const req = {};
    const res = mockRes();
    const next = vi.fn();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the role is not in the allowed list', () => {
    const req = { user: { id: 1, role: 'developer' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You do not have permission to perform this action'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the role is allowed', () => {
    const req = { user: { id: 1, role: 'admin' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole('admin', 'developer')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ignores any role supplied in the request body', () => {
    const req = { user: { role: 'developer' }, body: { role: 'admin' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireProjectMembership (integration point)', () => {
  it('is not implemented and returns 501', () => {
    const req = { user: { id: 1, role: 'developer' }, params: { projectId: '1' } };
    const res = mockRes();
    const next = vi.fn();

    requireProjectMembership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireProjectResponsibility (US-04d)', () => {
  const admin = { id: '3', role: 'admin' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['abc', '0', '-1', '1.5', ''])(
    'returns 400 for an invalid projectId (%s) without a database lookup',
    async (projectId) => {
      const req = { user: admin, params: { projectId } };
      const res = mockRes();
      const next = vi.fn();

      await requireProjectResponsibility(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'A valid projectId is required' });
      expect(getProjectResponsibility).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('returns 404 when the project does not exist', async () => {
    getProjectResponsibility.mockResolvedValue(null);
    const req = { user: admin, params: { projectId: '999' } };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(getProjectResponsibility).toHaveBeenCalledWith(999, '3');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for a project with no responsible Admin (responsible_admin_id NULL)', async () => {
    // getProjectResponsibility maps a NULL owner to isResponsible: false.
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });
    const req = { user: admin, params: { projectId: '2' } };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You are not responsible for this project'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when a different Admin is responsible for the project', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });
    const req = { user: { id: '7', role: 'admin' }, params: { projectId: '1' } };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '7');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for the responsible Admin', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: true });
    const req = { user: admin, params: { projectId: '1' } };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(getProjectResponsibility).toHaveBeenCalledWith(1, '3');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('checks the project in the route params, ignoring any projectId in the body or query', async () => {
    getProjectResponsibility.mockResolvedValue({ isResponsible: false });
    const req = {
      user: admin,
      params: { projectId: '2' },
      body: { projectId: '1' },
      query: { projectId: '1' }
    };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(getProjectResponsibility).toHaveBeenCalledWith(2, '3');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns a generic 500 when the lookup fails, without leaking the database error', async () => {
    getProjectResponsibility.mockRejectedValue(new Error('relation "projects" does not exist'));
    const req = { user: admin, params: { projectId: '1' } };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to check project responsibility'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 without a lookup if authentication has not run (no req.user)', async () => {
    const req = { params: { projectId: '1' } };
    const res = mockRes();
    const next = vi.fn();

    await requireProjectResponsibility(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getProjectResponsibility).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('in the normal stack, a Developer is stopped by requireRole before any responsibility lookup', async () => {
    jwt.verify.mockReturnValue({ id: '2', role: 'developer' });
    const req = { headers: { authorization: 'Bearer dev' }, params: { projectId: '1' } };
    const res = mockRes();

    // requireAuth -> requireRole('admin') -> requireProjectResponsibility,
    // each only running if the previous one called next().
    const stack = [requireAuth, requireRole('admin'), requireProjectResponsibility];
    const runFrom = async (index) => {
      if (index < stack.length) {
        await stack[index](req, res, () => runFrom(index + 1));
      }
    };
    await runFrom(0);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You do not have permission to perform this action'
    });
    expect(getProjectResponsibility).not.toHaveBeenCalled();
  });
});
