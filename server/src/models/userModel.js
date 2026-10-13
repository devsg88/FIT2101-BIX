import { pool } from '../config/db.js';

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  return rows[0] || null;
}

// All developers, org-wide - the base list an admin picks from before
// narrowing to "available for this team/project" (see teamModel.js and
// projectMembershipModel.js, which exclude users already assigned).
export async function listDevelopers() {
  const { rows } = await pool.query(
    `SELECT id, name, email FROM users WHERE role = 'developer' ORDER BY name`
  );
  return rows;
}

// One user by id, without the password hash, or null if no such user exists.
// Used to refuse a tag that points at a user who does not exist (US-09).
export async function findUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

export async function updateUserPasswordHash(userId, passwordHash) {
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id`,
    [passwordHash, userId]
  );
  return rows[0] ?? null;
}
