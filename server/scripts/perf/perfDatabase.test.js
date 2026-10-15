import { describe, it, expect } from 'vitest';
import {
  PERF_DB_COMMENT,
  checkPerfConfig,
  checkPerfIdentity,
  describeDatabaseUrl,
  openPerfPool
} from './perfDatabase.js';

// Placeholder URLs only - no real credentials.
const NORMAL = 'postgresql://user:secret@localhost:5432/bix_dev';
const PERF = 'postgresql://user:secret@localhost:5432/bix_performance_test';

describe('describeDatabaseUrl', () => {
  it('reads host, port and database name, defaulting the port', () => {
    expect(describeDatabaseUrl('postgres://u:p@LocalHost/my_db')).toEqual({
      host: 'localhost',
      port: '5432',
      database: 'my_db'
    });
  });

  it('returns null for missing or non-postgres values', () => {
    expect(describeDatabaseUrl(undefined)).toBeNull();
    expect(describeDatabaseUrl('')).toBeNull();
    expect(describeDatabaseUrl('mysql://u:p@localhost/db')).toBeNull();
    expect(describeDatabaseUrl('not a url')).toBeNull();
  });
});

describe('checkPerfConfig', () => {
  it('refuses when PERF_DATABASE_URL is missing', () => {
    expect(checkPerfConfig(undefined, NORMAL)).toEqual({ ok: false, reason: 'PERF_DATABASE_URL is not set' });
  });

  it('refuses when it is the same string as DATABASE_URL', () => {
    expect(checkPerfConfig(NORMAL, NORMAL).ok).toBe(false);
  });

  it('refuses the same database written differently (host case, default port)', () => {
    const result = checkPerfConfig(
      'postgresql://other:pw@LOCALHOST/bix_perf',
      'postgresql://user:secret@localhost:5432/bix_perf'
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/same database/);
  });

  it('refuses a database whose name does not mark it as a performance database', () => {
    const result = checkPerfConfig('postgresql://user:secret@localhost:5432/bix_copy', NORMAL);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/must contain "perf"/);
  });

  it('accepts a separate database named for performance testing', () => {
    expect(checkPerfConfig(PERF, NORMAL)).toEqual({ ok: true, database: 'bix_performance_test' });
  });

  it('never puts the connection string or password in a refusal reason', () => {
    const result = checkPerfConfig(NORMAL, NORMAL);
    expect(result.reason).not.toContain('secret');
    expect(result.reason).not.toContain('postgresql://');
  });
});

describe('checkPerfIdentity', () => {
  const good = {
    current_database: 'bix_performance_test',
    current_user: 'perf_owner',
    owner: 'perf_owner',
    comment: PERF_DB_COMMENT
  };

  it('accepts the expected database, owned by the connected user, with the marker comment', () => {
    expect(checkPerfIdentity(good, 'bix_performance_test')).toEqual({ ok: true });
  });

  it('refuses when connected to a different database than the URL names', () => {
    expect(checkPerfIdentity({ ...good, current_database: 'bix_dev' }, 'bix_performance_test').ok).toBe(false);
  });

  it('refuses when the connected user does not own the database', () => {
    expect(checkPerfIdentity({ ...good, owner: 'postgres' }, 'bix_performance_test').ok).toBe(false);
  });

  it('refuses without the exact marker comment', () => {
    expect(checkPerfIdentity({ ...good, comment: null }, 'bix_performance_test').ok).toBe(false);
    expect(checkPerfIdentity({ ...good, comment: `${PERF_DB_COMMENT}.` }, 'bix_performance_test').ok).toBe(false);
  });
});

describe('openPerfPool', () => {
  it('refuses before opening any connection when the configuration fails', async () => {
    await expect(openPerfPool({ DATABASE_URL: NORMAL })).rejects.toThrow(/Refusing to run: PERF_DATABASE_URL is not set/);
    await expect(openPerfPool({ DATABASE_URL: NORMAL, PERF_DATABASE_URL: NORMAL })).rejects.toThrow(/same database/);
  });
});
