import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from '../install/install-utils.mjs';
import { writeSmokeEvidence } from './smoke-evidence.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidence = {
  name: 'Install config smoke',
  startedAt: new Date().toISOString(),
  checks: []
};

let root;

try {
  root = mkdtempSync(join(tmpdir(), 'bellfield-install-config-smoke-'));
  const installRoot = join(root, 'install');
  const envPath = join(installRoot, 'bellfield-server.env');

  runCommand(process.execPath, [
    join(repoRoot, 'tools', 'install', 'write-server-config.mjs'),
    `--install-root=${installRoot}`
  ]);
  check('write-server-config produced bellfield-server.env', existsSync(envPath), { envPath });

  const env = parseEnvFile(envPath);
  check('generated relay base URL is blank', !env.BELLFIELD_RELAY_BASE_URL?.trim());
  check('generated relay token is blank', !env.BELLFIELD_RELAY_TOKEN?.trim());
  check(
    'generated relay server instance id is present',
    Boolean(env.BELLFIELD_RELAY_SERVER_INSTANCE_ID?.trim())
  );

  const pnpm = pnpmInvocation([
    '--filter',
    '@bellfield/worker',
    'exec',
    'tsx',
    join(repoRoot, 'tools', 'smoke', 'install-config-runtime-check.ts'),
    `--env=${envPath}`
  ]);
  const runtimeResult = runCommand(pnpm.command, pnpm.args, { capture: true });
  const runtime = JSON.parse(runtimeResult.stdout.trim());
  check('API accepts generated clean-install env', runtime.api.nodeEnv === 'production', {
    api: runtime.api
  });
  check('API treats generated instance id alone as relay disabled', runtime.api.relayDisabled);
  check('worker accepts generated clean-install env', runtime.worker.nodeEnv === 'production', {
    worker: runtime.worker
  });
  check(
    'worker treats generated instance id alone as relay disabled',
    runtime.worker.relayDisabled
  );

  evidence.generatedRelayShape = runtime.generatedRelayShape;
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'install-config-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'install-config-smoke.json')}`);
  process.exitCode = 1;
} finally {
  if (root) {
    rmSync(root, { force: true, recursive: true, maxRetries: 2, retryDelay: 250 });
  }
}

function pnpmInvocation(args) {
  if (process.env.npm_execpath) {
    if (!/\.(?:cjs|mjs|js)$/i.test(process.env.npm_execpath)) {
      return {
        command: process.env.npm_execpath,
        args
      };
    }

    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args]
    };
  }

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args
  };
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}

function runCommand(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    timeout: options.timeoutMs ?? 120_000
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}${
        stdout ? `\nstdout:\n${stdout}` : ''
      }${stderr ? `\nstderr:\n${stderr}` : ''}`
    );
  }

  return result;
}
