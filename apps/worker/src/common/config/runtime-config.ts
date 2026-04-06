type NodeEnvironment = 'development' | 'test' | 'production';

function getNodeEnv(value: string | undefined): NodeEnvironment {
  if (value === 'test' || value === 'production') {
    return value;
  }

  return 'development';
}

export type WorkerRuntimeConfig = {
  nodeEnv: NodeEnvironment;
};

export function getWorkerRuntimeConfig(): WorkerRuntimeConfig {
  return {
    nodeEnv: getNodeEnv(process.env.NODE_ENV)
  };
}
