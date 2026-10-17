import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../config/db.js';
import {
  createPasswordResetToken,
  describeResetTokenState,
  findResetTokenByRawToken,
  hashResetToken
} from './passwordResetModel.js';

describe('passwordResetModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores a hash rather than the raw token', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, user_id: 2 }] });
    const { rawToken, record } = await createPasswordResetToken(2);
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const insertCall = pool.query.mock.calls.find(([sql]) => String(sql).includes('INSERT'));
    expect(insertCall[1][1]).toBe(hashResetToken(rawToken));
    expect(insertCall[1][1]).not.toBe(rawToken);
    expect(record.id).toBe(1);
  });

  it('looks up tokens by hash', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 3 }] });
    await findResetTokenByRawToken('abcd');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/token_hash/),
      [hashResetToken('abcd')]
    );
  });

  it('classifies missing, used, expired and valid rows', () => {
    expect(describeResetTokenState(null)).toBe('invalid');
    expect(describeResetTokenState({ used_at: new Date() })).toBe('used');
    expect(describeResetTokenState({
      used_at: null,
      expires_at: new Date(Date.now() - 1000)
    })).toBe('expired');
    expect(describeResetTokenState({
      used_at: null,
      expires_at: new Date(Date.now() + 60_000)
    })).toBe('valid');
  });
});
