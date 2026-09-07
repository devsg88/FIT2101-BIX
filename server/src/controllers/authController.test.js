import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginController } from './authController.js';
import { findUserByEmail } from '../models/userModel.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

vi.mock('../models/userModel.js');
vi.mock('bcrypt');
vi.mock('jsonwebtoken');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('loginController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when email is missing', async () => {
    const req = { body: { password: 'secret' } };
    const res = mockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when password is missing', async () => {
    const req = { body: { email: 'a@b.com' } };
    const res = mockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when the user does not exist', async () => {
    findUserByEmail.mockResolvedValue(null);
    const req = { body: { email: 'unknown@bix.com', password: 'secret' } };
    const res = mockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  it('returns 401 when the password does not match', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, password_hash: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);
    const req = { body: { email: 'user@bix.com', password: 'wrong' } };
    const res = mockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  it('returns a token and user info on success', async () => {
    findUserByEmail.mockResolvedValue({
      id: 1,
      name: 'Jane',
      role: 'developer',
      password_hash: 'hashed'
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed.jwt.token');
    const req = { body: { email: 'jane@bix.com', password: 'correct' } };
    const res = mockRes();

    await loginController(req, res);

    expect(res.json).toHaveBeenCalledWith({
      user: { id: 1, name: 'Jane', role: 'developer', token: 'signed.jwt.token' }
    });
  });
});
