import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireAuth,
  requireRole,
  requireProjectMembership
} from './authMiddleware.js';
import jwt from 'jsonwebtoken';

vi.mock('jsonwebtoken');

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
