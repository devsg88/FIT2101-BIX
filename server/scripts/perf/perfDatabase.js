import pg from 'pg';

// NFR-02 / SCRUM-196. Safety guard for the performance tooling in this folder.
//
// Every perf script resets, rebuilds or measures a database, so each one must
// only ever touch the separate performance database - never the normal
// development database in DATABASE_URL. A perf script calls openPerfPool()
// first and refuses to run unless ALL of these hold:
//
//   1. PERF_DATABASE_URL is set.
//   2. It is not the same database as DATABASE_URL (same host, port and name).
//   3. Its database name contains "perf" (e.g. bix_performance_test).
//   4. Once connected, current_database() is the database named in the URL.
//   5. The connected user owns that database, so a reset can only ever drop
//      objects in a database this user was given for the purpose.
//   6. The database comment is exactly PERF_DB_COMMENT. A person sets it once
//      when creating the database (see README.md); it is how the tooling
//      positively identifies a database that is safe to reset.
//
// Connection strings and credentials are never printed: failures name only
// the rule that failed and, at most, the database name.

export const PERF_DB_COMMENT = 'BIX performance test database - safe to reset';

// Splits a connection string into the parts used to tell databases apart.
// Returns null for anything that does not parse as a postgres URL.
export function describeDatabaseUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
      return null;
    }
    return {
      host: parsed.hostname.toLowerCase(),
      port: parsed.port || '5432',
      database: decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    };
  } catch {
    return null;
  }
}

// Rules 1-3: checks the configuration before any connection is opened.
// Returns { ok: true, database } or { ok: false, reason }.
export function checkPerfConfig(perfUrl, normalUrl) {
  if (!perfUrl) {
    return { ok: false, reason: 'PERF_DATABASE_URL is not set' };
  }

  const perf = describeDatabaseUrl(perfUrl);
  if (!perf || !perf.database) {
    return { ok: false, reason: 'PERF_DATABASE_URL is not a valid postgres connection string' };
  }

  if (normalUrl) {
    const normal = describeDatabaseUrl(normalUrl);
    const sameDatabase =
      perfUrl === normalUrl ||
      (normal &&
        normal.host === perf.host &&
        normal.port === perf.port &&
        normal.database === perf.database);
    if (sameDatabase) {
      return { ok: false, reason: 'PERF_DATABASE_URL points at the same database as DATABASE_URL' };
    }
  }

  if (!/perf/i.test(perf.database)) {
    return {
      ok: false,
      reason: `database "${perf.database}" is not named as a performance database (its name must contain "perf")`
    };
  }

  return { ok: true, database: perf.database };
}

// Rules 4-6: checks the live connection really is the intended database.
// `identity` is the row read by IDENTITY_SQL below.
export function checkPerfIdentity(identity, expectedDatabase) {
  if (!identity) {
    return { ok: false, reason: 'could not read the connected database identity' };
  }
  if (identity.current_database !== expectedDatabase) {
    return { ok: false, reason: 'the connected database is not the one named in PERF_DATABASE_URL' };
  }
  if (identity.owner !== identity.current_user) {
    return { ok: false, reason: `the connected user does not own "${expectedDatabase}"` };
  }
  if (identity.comment !== PERF_DB_COMMENT) {
    return {
      ok: false,
      reason: `"${expectedDatabase}" does not carry the performance-database comment (see scripts/perf/README.md)`
    };
  }
  return { ok: true };
}

const IDENTITY_SQL = `
  SELECT current_database() AS current_database,
         current_user       AS current_user,
         pg_get_userbyid(d.datdba) AS owner,
         shobj_description(d.oid, 'pg_database') AS comment
    FROM pg_database d
   WHERE d.datname = current_database()`;

// Opens a pool on the performance database after every check above passes.
// Throws (without any connection details) if one fails.
export async function openPerfPool(env = process.env) {
  const config = checkPerfConfig(env.PERF_DATABASE_URL, env.DATABASE_URL);
  if (!config.ok) {
    throw new Error(`Refusing to run: ${config.reason}`);
  }

  const pool = new pg.Pool({ connectionString: env.PERF_DATABASE_URL, max: 4 });
  try {
    const { rows } = await pool.query(IDENTITY_SQL);
    const identity = checkPerfIdentity(rows[0], config.database);
    if (!identity.ok) {
      throw new Error(`Refusing to run: ${identity.reason}`);
    }
  } catch (err) {
    await pool.end();
    throw err;
  }

  return { pool, database: config.database };
}
