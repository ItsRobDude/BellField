import type { RuntimeBuildManifest } from './build-manifest';
import { readRuntimeBuildManifest } from './build-manifest';

type NodeEnvironment = 'development' | 'test' | 'production';

const defaultPort = 3001;
const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const defaultOfficeSessionTtlHours = 12;
const defaultFieldSessionTtlDays = 30;
const hourInMs = 60 * 60 * 1000;
const dayInMs = 24 * hourInMs;

function getNodeEnv(value: string | undefined): NodeEnvironment {
  if (value === 'test' || value === 'production') {
    return value;
  }

  return 'development';
}

/**
 * Resolves PORT. An unset value uses the default. A value that is set but is not
 * a positive integer is a misconfiguration: in production it is reported (so the
 * caller refuses to start) rather than being silently ignored; in dev/test it
 * falls back to the default so local runs stay forgiving.
 */
function resolvePort(value: string | undefined, isProduction: boolean, problems: string[]): number {
  const trimmed = value?.trim();

  if (!trimmed) {
    return defaultPort;
  }

  const parsedPort = Number(trimmed);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    if (isProduction) {
      problems.push(`PORT must be a positive integer; received ${JSON.stringify(value)}.`);
    }
    return defaultPort;
  }

  return parsedPort;
}

function getBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return defaultValue;
}

function resolvePositiveInteger(
  envName: string,
  value: string | undefined,
  defaultValue: number,
  unitLabel: string,
  problems: string[]
): number {
  const trimmed = value?.trim();

  if (!trimmed) {
    return defaultValue;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(
      `${envName} must be a positive integer number of ${unitLabel}; received ${JSON.stringify(
        value
      )}.`
    );
    return defaultValue;
  }

  return parsed;
}

export type ApiRelayConfig = {
  baseUrl: string;
  token: string;
  serverInstanceId: string;
};

export type ApiSessionTtlConfig = {
  officeWebMs: number;
  fieldMobileMs: number;
};

export type ApiRuntimeConfig = {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  bootstrapSeedData: boolean;
  officeOrigins: string[] | true;
  licenseRequired: boolean;
  licensePath?: string;
  sessionTtl: ApiSessionTtlConfig;
  buildManifest: RuntimeBuildManifest | null;
  /**
   * BellField delivery relay client credentials. Absent means relay-backed
   * features (estimate email) report not configured; the software runs fine.
   * No provider API key ever exists on an install (docs/delivery-relay-plan.md §1).
   */
  relay?: ApiRelayConfig;
};

/**
 * Reads and validates runtime configuration from the environment.
 *
 * BellField uses a mixed posture (matching MediaConfigService): production must
 * fail fast when required configuration is missing or invalid, while dev/test
 * fall back to safe local defaults. Production problems are collected and
 * reported together in a single error so an operator can fix everything at once
 * instead of hitting one boot failure at a time.
 */
export function getApiRuntimeConfig(): ApiRuntimeConfig {
  const nodeEnv = getNodeEnv(process.env.NODE_ENV);
  const isProduction = nodeEnv === 'production';
  const problems: string[] = [];

  const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
  let databaseUrl = defaultDatabaseUrl;
  if (configuredDatabaseUrl) {
    databaseUrl = configuredDatabaseUrl;
  } else if (isProduction) {
    // In production we must not silently connect to the local dev database.
    problems.push(
      'DATABASE_URL must be set to the PostgreSQL connection string for the BellField database.'
    );
  }

  const port = resolvePort(
    process.env.BELLFIELD_API_PORT ?? process.env.PORT,
    isProduction,
    problems
  );
  const bootstrapSeedData = getBoolean(process.env.BOOTSTRAP_SEED_DATA, false);
  const officeOrigins = resolveOfficeOrigins(
    process.env.BELLFIELD_OFFICE_ORIGINS,
    isProduction,
    problems
  );
  const buildManifest = readRuntimeBuildManifest();
  const licenseRequired =
    buildManifest?.licenseRequired === true ||
    getBoolean(process.env.BELLFIELD_LICENSE_REQUIRED, false);
  const licensePath = process.env.BELLFIELD_LICENSE_PATH?.trim() || undefined;
  const officeSessionTtlHours = resolvePositiveInteger(
    'BELLFIELD_OFFICE_SESSION_TTL_HOURS',
    process.env.BELLFIELD_OFFICE_SESSION_TTL_HOURS,
    defaultOfficeSessionTtlHours,
    'hours',
    problems
  );
  const fieldSessionTtlDays = resolvePositiveInteger(
    'BELLFIELD_FIELD_SESSION_TTL_DAYS',
    process.env.BELLFIELD_FIELD_SESSION_TTL_DAYS,
    defaultFieldSessionTtlDays,
    'days',
    problems
  );

  if (buildManifest?.buildKind === 'release' && !isProduction) {
    problems.push('Release artifacts must run with NODE_ENV=production.');
  }

  if (isProduction && bootstrapSeedData) {
    problems.push('BOOTSTRAP_SEED_DATA must not be true in production.');
  }

  if (licenseRequired && !licensePath) {
    problems.push('BELLFIELD_LICENSE_PATH must be set when BELLFIELD_LICENSE_REQUIRED=true.');
  }

  const relay = resolveRelayConfig(isProduction, problems);

  if (problems.length > 0) {
    throw new Error(
      [
        `BellField API cannot start: ${problems.length} configuration problem(s) found.`,
        ...problems.map((problem) => `  - ${problem}`),
        'See .env.example for the required production settings.'
      ].join('\n')
    );
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    bootstrapSeedData,
    officeOrigins,
    licenseRequired,
    licensePath,
    sessionTtl: {
      officeWebMs: officeSessionTtlHours * hourInMs,
      fieldMobileMs: fieldSessionTtlDays * dayInMs
    },
    buildManifest,
    relay
  };
}

/**
 * The relay client is configured by three values that only make sense
 * together. All absent means relay features are simply not set up (valid);
 * a partial set is a misconfiguration and fails fast in production.
 */
function resolveRelayConfig(isProduction: boolean, problems: string[]): ApiRelayConfig | undefined {
  const baseUrl = process.env.BELLFIELD_RELAY_BASE_URL?.trim().replace(/\/+$/, '');
  const token = process.env.BELLFIELD_RELAY_TOKEN?.trim();
  const serverInstanceId = process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID?.trim();

  if (!baseUrl && !token && !serverInstanceId) {
    return undefined;
  }

  if (!baseUrl || !token || !serverInstanceId) {
    if (isProduction) {
      problems.push(
        'BELLFIELD_RELAY_BASE_URL, BELLFIELD_RELAY_TOKEN, and BELLFIELD_RELAY_SERVER_INSTANCE_ID must all be set together (or all left empty).'
      );
    }
    return undefined;
  }

  return { baseUrl, token, serverInstanceId };
}

function resolveOfficeOrigins(
  value: string | undefined,
  isProduction: boolean,
  problems: string[]
): string[] | true {
  const origins =
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (origins.length > 0) {
    return origins;
  }

  if (isProduction) {
    problems.push(
      'BELLFIELD_OFFICE_ORIGINS must list the allowed office-web origin(s) in production.'
    );
  }

  return true;
}
