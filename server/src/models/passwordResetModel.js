import crypto from 'crypto';
import { pool } from '../config/db.js';

// US-14 — Yichi Zhang (SCRUM-169)
// Raw reset tokens are hashed before insert. Lookups always use the hash.

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken), 'utf8').digest('hex');
}

export async function invalidateUnusedTokensForUser(userId) {
  await pool.query(
    `UPDATE password_reset_tokens
        SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

export async function insertPasswordResetToken(userId, tokenHash, expiresAt) {
  const { rows } = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, token_hash, expires_at, used_at, created_at`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
}

export async function createPasswordResetToken(userId) {
  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await invalidateUnusedTokensForUser(userId);
  const row = await insertPasswordResetToken(userId, tokenHash, expiresAt);
  return { rawToken, record: row };
}

export async function findResetTokenByRawToken(rawToken) {
  if (!rawToken) {
    return null;
  }
  const tokenHash = hashResetToken(rawToken);
  const { rows } = await pool.query(
    `SELECT id, user_id, token_hash, expires_at, used_at, created_at
       FROM password_reset_tokens
      WHERE token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export function describeResetTokenState(row, now = new Date()) {
  if (!row) {
    return 'invalid';
  }
  if (row.used_at) {
    return 'used';
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'valid';
}

export async function markResetTokenUsed(id) {
  const { rows } = await pool.query(
    `UPDATE password_reset_tokens
        SET used_at = now()
      WHERE id = $1 AND used_at IS NULL
      RETURNING id`,
    [id]
  );
  return rows[0] ?? null;
}
