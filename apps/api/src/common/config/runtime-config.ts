type NodeEnvironment = 'development' | 'test' | 'production';

const defaultPort = 3001;

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

export type ApiRuntimeConfig = {
  nodeEnv: NodeEnvironment;
  port: number;
};

export function getApiRuntimeConfig(): ApiRuntimeConfig {
  return {
    nodeEnv: getNodeEnv(process.env.NODE_ENV),
    port: getPort(process.env.PORT)
  };
}
