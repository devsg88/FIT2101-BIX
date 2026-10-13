import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import {
  FORGOT_PASSWORD_CONFIRMATION,
  RESET_TOKEN_UNUSABLE_MESSAGE,
  forgotPasswordController,
  resetPasswordController
} from './passwordResetController.js';
import { findUserByEmail, updateUserPasswordHash } from '../models/userModel.js';
import {
  createPasswordResetToken,
  describeResetTokenState,
  findResetTokenByRawToken,
  invalidateUnusedTokensForUser,
  markResetTokenUsed
} from '../models/passwordResetModel.js';
import { deliverPasswordResetToken } from '../services/resetTokenDelivery.js';

vi.mock('bcrypt');
vi.mock('../models/userModel.js');
vi.mock('../models/passwordResetModel.js');
vi.mock('../services/resetTokenDelivery.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('forgotPasswordController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when email is missing', async () => {
    const res = mockRes();
    await forgotPasswordController({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createPasswordResetToken).not.toHaveBeenCalled();
  });

  it('returns the same confirmation when the account does not exist', async () => {
    findUserByEmail.mockResolvedValue(null);
    const res = mockRes();
    await forgotPasswordController({ body: { email: 'missing@bix.app' } }, res);
    expect(res.json).toHaveBeenCalledWith({ message: FORGOT_PASSWORD_CONFIRMATION });
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(deliverPasswordResetToken).not.toHaveBeenCalled();
  });

  it('creates and delivers a token when the account exists, without returning it', async () => {
    findUserByEmail.mockResolvedValue({ id: 2, email: 'developer@bix.app' });
    createPasswordResetToken.mockResolvedValue({ rawToken: 'secret-token' });
    const res = mockRes();
    await forgotPasswordController({ body: { email: 'Developer@bix.app' } }, res);
    expect(findUserByEmail).toHaveBeenCalledWith('developer@bix.app');
    expect(createPasswordResetToken).toHaveBeenCalledWith(2);
    expect(deliverPasswordResetToken).toHaveBeenCalledWith({
      email: 'developer@bix.app',
      rawToken: 'secret-token'
    });
    expect(res.json).toHaveBeenCalledWith({ message: FORGOT_PASSWORD_CONFIRMATION });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret-token');
  });
});

describe('resetPasswordController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    describeResetTokenState.mockImplementation((row) => {
      if (!row) return 'invalid';
      if (row.used_at) return 'used';
      if (row.expired) return 'expired';
      return 'valid';
    });
  });

  it('rejects a missing token with a retry option in the message', async () => {
    const res = mockRes();
    await resetPasswordController({ body: { password: 'newpass12', confirm_password: 'newpass12' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: RESET_TOKEN_UNUSABLE_MESSAGE });
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = mockRes();
    await resetPasswordController({
      body: { token: 'abc', password: 'short', confirm_password: 'short' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it('rejects expired, used or unknown tokens', async () => {
    findResetTokenByRawToken.mockResolvedValue({ id: 9, used_at: new Date() });
    const res = mockRes();
    await resetPasswordController({
      body: { token: 'used', password: 'newpass12', confirm_password: 'newpass12' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: RESET_TOKEN_UNUSABLE_MESSAGE });
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it('updates the hash, consumes the token, and does not return account data', async () => {
    findResetTokenByRawToken.mockResolvedValue({ id: 4, user_id: 2 });
    bcrypt.hash.mockResolvedValue('new-hash');
    updateUserPasswordHash.mockResolvedValue({ id: 2 });
    markResetTokenUsed.mockResolvedValue({ id: 4 });
    const res = mockRes();
    await resetPasswordController({
      body: { token: 'valid-token', password: 'newpass12', confirm_password: 'newpass12' }
    }, res);
    expect(bcrypt.hash).toHaveBeenCalledWith('newpass12', 10);
    expect(updateUserPasswordHash).toHaveBeenCalledWith(2, 'new-hash');
    expect(markResetTokenUsed).toHaveBeenCalledWith(4);
    expect(invalidateUnusedTokensForUser).toHaveBeenCalledWith(2);
    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toMatch(/sign in/i);
    expect(payload).not.toHaveProperty('user');
    expect(payload).not.toHaveProperty('token');
  });
});
