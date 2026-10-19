import pg from 'pg';

const { Pool } = pg;

// Managed Postgres hosts (Render, Railway, Supabase, Neon, ...) require SSL
// on external connections and present a certificate pg's default strict
// verification rejects, so a plain Pool that works against a local database
// fails outright once DATABASE_URL points at one. SSL is opt-in via
// DATABASE_SSL rather than inferred from NODE_ENV, so local development
// (a plain, unencrypted localhost connection) keeps working with no
// configuration at all, and a deployed environment turns it on explicitly.
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl
});
