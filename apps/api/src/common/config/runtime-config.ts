type NodeEnvironment = 'development' | 'test' | 'production';

const defaultPort = 3001;
const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';

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

export type ApiRuntimeConfig = {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  bootstrapSeedData: boolean;
  estimateEmailResendApiKey?: string;
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

  const port = resolvePort(process.env.PORT, isProduction, problems);

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
    bootstrapSeedData: getBoolean(process.env.BOOTSTRAP_SEED_DATA, nodeEnv !== 'production'),
    estimateEmailResendApiKey:
      process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY?.trim() || undefined
  };
}
