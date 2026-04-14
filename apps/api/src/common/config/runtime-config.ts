type NodeEnvironment = 'development' | 'test' | 'production';

const defaultPort = 3001;
const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';

function getNodeEnv(value: string | undefined): NodeEnvironment {
  if (value === 'test' || value === 'production') {
    return value;
  }

  return 'development';
}

function getPort(value: string | undefined): number {
  if (!value) {
    return defaultPort;
  }

  const parsedPort = Number(value);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
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
};

export function getApiRuntimeConfig(): ApiRuntimeConfig {
  const nodeEnv = getNodeEnv(process.env.NODE_ENV);

  return {
    nodeEnv,
    port: getPort(process.env.PORT),
    databaseUrl: process.env.DATABASE_URL?.trim() || defaultDatabaseUrl,
    bootstrapSeedData: getBoolean(process.env.BOOTSTRAP_SEED_DATA, nodeEnv !== 'production')
  };
}
