import { readFileSync } from 'node:fs';
import { getApiRuntimeConfig } from '../../apps/api/src/common/config/runtime-config';
import { getWorkerRuntimeConfig } from '../../apps/worker/src/common/config/runtime-config';

const envPath = getArgValue('--env');
if (!envPath) {
  throw new Error('Missing --env=<path-to-bellfield-server.env>.');
}

const env = parseEnvFile(envPath);
const managedEnvKeys = [
  ...Object.keys(env),
  'PORT',
  'BELLFIELD_BUILD_MANIFEST_PATH',
  'BELLFIELD_DELIVERY_RETRY_INTERVAL_SECONDS',
  'BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES',
  'BELLFIELD_ACCEPTANCE_DECISIONS_INTERVAL_SECONDS'
];

for (const key of managedEnvKeys) {
  delete process.env[key];
}
Object.assign(process.env, env);

const api = getApiRuntimeConfig();
const worker = getWorkerRuntimeConfig();

console.log(
  JSON.stringify({
    api: {
      nodeEnv: api.nodeEnv,
      relayDisabled: api.relay === undefined,
      licenseRequired: api.licenseRequired,
      licensePathConfigured: Boolean(api.licensePath)
    },
    worker: {
      nodeEnv: worker.nodeEnv,
      relayDisabled: worker.relay === undefined,
      backupEnabled: worker.backup.enabled,
      backupRootConfigured: Boolean(worker.backup.root)
    },
    generatedRelayShape: {
      baseUrlBlank: !env.BELLFIELD_RELAY_BASE_URL?.trim(),
      tokenBlank: !env.BELLFIELD_RELAY_TOKEN?.trim(),
      serverInstanceIdPresent: Boolean(env.BELLFIELD_RELAY_SERVER_INSTANCE_ID?.trim())
    }
  })
);

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function parseEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) {
          return [line, ''];
        }
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}
