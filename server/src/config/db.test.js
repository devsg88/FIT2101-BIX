import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PoolMock = vi.fn();
vi.mock('pg', () => ({
  default: { Pool: PoolMock }
}));

describe('db pool SSL configuration', () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalSsl = process.env.DATABASE_SSL;

  beforeEach(() => {
    vi.resetModules();
    PoolMock.mockClear();
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/bix';
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    process.env.DATABASE_SSL = originalSsl;
  });

  it('omits ssl by default, so local Postgres keeps working unconfigured', async () => {
    delete process.env.DATABASE_SSL;

    await import('./db.js');

    expect(PoolMock).toHaveBeenCalledWith({
      connectionString: process.env.DATABASE_URL,
      ssl: undefined
    });
  });

  it('omits ssl when DATABASE_SSL is not exactly "true"', async () => {
    process.env.DATABASE_SSL = 'false';

    await import('./db.js');

    expect(PoolMock).toHaveBeenCalledWith({
      connectionString: process.env.DATABASE_URL,
      ssl: undefined
    });
  });

  it('enables ssl with rejectUnauthorized: false when DATABASE_SSL=true', async () => {
    process.env.DATABASE_SSL = 'true';

    await import('./db.js');

    expect(PoolMock).toHaveBeenCalledWith({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  });
});
