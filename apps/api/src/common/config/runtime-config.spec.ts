import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getApiRuntimeConfig } from './runtime-config';

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const validProductionDatabaseUrl = 'postgresql://app:secret@db.internal:5432/bellfield';

function buildManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    buildKind: 'release',
    licenseRequired: true,
    version: '0.0.1',
    releaseDate: '2026-06-11',
    generatedAt: '2026-06-11T00:00:00.000Z',
    sourceCommit: 'abc1234',
    ...overrides
  };
}

describe('getApiRuntimeConfig', () => {
  const envKeys = [
    'NODE_ENV',
    'PORT',
    'BELLFIELD_API_PORT',
    'DATABASE_URL',
    'BOOTSTRAP_SEED_DATA',
    'BELLFIELD_OFFICE_ORIGINS',
    'BELLFIELD_BUILD_MANIFEST_PATH',
    'BELLFIELD_LICENSE_REQUIRED',
    'BELLFIELD_LICENSE_PATH',
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
    expect(config.licenseRequired).toBe(false);
    expect(config.licensePath).toBeUndefined();
    expect(config.buildManifest).toBeNull();
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
    process.env.BELLFIELD_LICENSE_REQUIRED = 'true';
    process.env.BELLFIELD_LICENSE_PATH = 'C:\\BellField\\data\\license\\bellfield-license.json';

    const config = getApiRuntimeConfig();

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(8080);
    expect(config.databaseUrl).toBe(validProductionDatabaseUrl);
    expect(config.bootstrapSeedData).toBe(false);
    expect(config.officeOrigins).toEqual([
      'https://office.example.com',
      'http://server.local:3000'
    ]);
    expect(config.licenseRequired).toBe(true);
    expect(config.licensePath).toBe('C:\\BellField\\data\\license\\bellfield-license.json');
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

  it('refuses license-required runtime without a license path', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = validProductionDatabaseUrl;
    process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';
    process.env.BELLFIELD_LICENSE_REQUIRED = 'true';

    expect(() => getApiRuntimeConfig()).toThrow(/BELLFIELD_LICENSE_PATH/);
  });

  it('requires a license when the release build manifest requires one even if env disables it', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-build-manifest-spec-'));
    try {
      const manifestPath = join(root, 'bellfield-build-manifest.json');
      writeFileSync(manifestPath, JSON.stringify(buildManifest()), 'utf8');
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = validProductionDatabaseUrl;
      process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';
      process.env.BELLFIELD_BUILD_MANIFEST_PATH = manifestPath;
      process.env.BELLFIELD_LICENSE_REQUIRED = 'false';

      expect(() => getApiRuntimeConfig()).toThrow(/BELLFIELD_LICENSE_PATH/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('accepts a release build manifest when the required license path is configured', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-build-manifest-spec-'));
    try {
      const manifestPath = join(root, 'bellfield-build-manifest.json');
      writeFileSync(manifestPath, JSON.stringify(buildManifest()), 'utf8');
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = validProductionDatabaseUrl;
      process.env.BELLFIELD_OFFICE_ORIGINS = 'https://office.example.com';
      process.env.BELLFIELD_BUILD_MANIFEST_PATH = manifestPath;
      process.env.BELLFIELD_LICENSE_REQUIRED = 'false';
      process.env.BELLFIELD_LICENSE_PATH = 'C:\\BellField\\data\\license\\bellfield-license.json';

      const config = getApiRuntimeConfig();

      expect(config.licenseRequired).toBe(true);
      expect(config.licensePath).toBe('C:\\BellField\\data\\license\\bellfield-license.json');
      expect(config.buildManifest).toMatchObject({
        buildKind: 'release',
        version: '0.0.1',
        releaseDate: '2026-06-11',
        licenseRequired: true
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects a malformed release build manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-build-manifest-spec-'));
    try {
      const manifestPath = join(root, 'bellfield-build-manifest.json');
      writeFileSync(
        manifestPath,
        JSON.stringify(buildManifest({ releaseDate: '2026-99-99' })),
        'utf8'
      );
      process.env.BELLFIELD_BUILD_MANIFEST_PATH = manifestPath;

      expect(() => getApiRuntimeConfig()).toThrow(/build manifest is invalid/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
