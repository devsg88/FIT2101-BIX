import { pool } from '../config/db.js';

// Fallback demo accounts for local development while the users table is being finalized
const DEMO_USERS = {
  'pang@bix.app': {
    id: 1,
    name: 'Pang',
    email: 'pang@bix.app',
    role: 'developer',
    password_hash: '$2b$10$unb69kAx.iy7mc3SEKOKGe1xa9G5THJOTwtYGxlN.EQQcu5YtlZjm'
  },
  'developer@bix.app': {
    id: 2,
    name: 'Pang',
    email: 'developer@bix.app',
    role: 'developer',
    password_hash: '$2b$10$unb69kAx.iy7mc3SEKOKGe1xa9G5THJOTwtYGxlN.EQQcu5YtlZjm'
  },
  'admin@bix.app': {
    id: 3,
    name: 'Admin',
    email: 'admin@bix.app',
    role: 'admin',
    password_hash: '$2b$10$unb69kAx.iy7mc3SEKOKGe1xa9G5THJOTwtYGxlN.EQQcu5YtlZjm'
  }
};

export async function findUserByEmail(email) {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows[0]) return rows[0];
  } catch {
    // Database or users table is not yet set up locally — fall back to demo user
  }

  return DEMO_USERS[email] || null;
}
