import { getApiRuntimeConfig } from './runtime-config';

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const validProductionDatabaseUrl = 'postgresql://app:secret@db.internal:5432/bellfield';

describe('getApiRuntimeConfig', () => {
  const envKeys = [
    'NODE_ENV',
    'PORT',
    'BELLFIELD_API_PORT',
    'DATABASE_URL',
    'BOOTSTRAP_SEED_DATA',
    'BELLFIELD_OFFICE_ORIGINS',
    'BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY'
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Start each case from a clean slate so an unset key really means unset.
    for (const key of envKeys) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it('falls back to safe local defaults in development', () => {
    const config = getApiRuntimeConfig();

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3001);
    expect(config.databaseUrl).toBe(defaultDatabaseUrl);
    expect(config.bootstrapSeedData).toBe(false);
    expect(config.officeOrigins).toBe(true);
    expect(config.estimateEmailResendApiKey).toBeUndefined();
  });

  it('treats the test environment as non-production and forgiving', () => {
    process.env.NODE_ENV = 'test';

    const config = getApiRuntimeConfig();

    expect(config.nodeEnv).toBe('test');
    expect(config.databaseUrl).toBe(defaultDatabaseUrl);
    expect(config.bootstrapSeedData).toBe(false);
    expect(config.officeOrigins).toBe(true);
  });

  it('runs seed bootstrap only when explicitly enabled outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.BOOTSTRAP_SEED_DATA = 'true';

    const config = getApiRuntimeConfig();

    expect(config.bootstrapSeedData).toBe(true);
  });

  it('reads explicit valid values in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_API_PORT = '8080';
    process.env.DATABASE_URL = validProductionDatabaseUrl;
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com, http://server.local:3000';

    const config = getApiRuntimeConfig();

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(8080);
    expect(config.databaseUrl).toBe(validProductionDatabaseUrl);
    expect(config.bootstrapSeedData).toBe(false);
    expect(config.officeOrigins).toEqual([
      'https://office.example.com',
      'http://server.local:3000'
    ]);
  });

  it('keeps PORT as the backward-compatible local port fallback', () => {
    process.env.NODE_ENV = 'development';
    process.env.PORT = '4040';

    const config = getApiRuntimeConfig();

    expect(config.port).toBe(4040);
  });

  it('reads the server-owned estimate email resend key when configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = validProductionDatabaseUrl;
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';
    process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY = '  re_server_owned  ';

    const config = getApiRuntimeConfig();

    expect(config.estimateEmailResendApiKey).toBe('re_server_owned');
  });

  it('refuses to start in production when DATABASE_URL is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';

    expect(() => getApiRuntimeConfig()).toThrow(/DATABASE_URL must be set/);
  });

  it('treats a blank DATABASE_URL as missing in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '   ';
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';

    expect(() => getApiRuntimeConfig()).toThrow(/DATABASE_URL must be set/);
  });

  it('refuses to start in production when PORT is set but invalid', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = validProductionDatabaseUrl;
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';
    process.env.PORT = 'not-a-port';

    expect(() => getApiRuntimeConfig()).toThrow(/PORT must be a positive integer/);
  });

  it('refuses to start in production when the office origin allowlist is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = validProductionDatabaseUrl;

    expect(() => getApiRuntimeConfig()).toThrow(/BELLFIELD_OFFICE_ORIGINS/);
  });

  it('aggregates multiple production configuration problems into one error', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '-1';
    // DATABASE_URL and BELLFIELD_OFFICE_ORIGINS intentionally left unset.

    expect(() => getApiRuntimeConfig()).toThrow(/3 configuration problem/);

    try {
      getApiRuntimeConfig();
      throw new Error('expected getApiRuntimeConfig to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('PORT');
      expect(message).toContain('BELLFIELD_OFFICE_ORIGINS');
    }
  });

  it('stays forgiving about an invalid PORT outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.PORT = 'nonsense';

    const config = getApiRuntimeConfig();

    expect(config.port).toBe(3001);
  });

  it('refuses an explicit BOOTSTRAP_SEED_DATA override in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = validProductionDatabaseUrl;
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';
    process.env.BOOTSTRAP_SEED_DATA = 'true';

    expect(() => getApiRuntimeConfig()).toThrow(/BOOTSTRAP_SEED_DATA must not be true/);
  });
});
