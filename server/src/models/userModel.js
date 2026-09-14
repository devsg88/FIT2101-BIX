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
