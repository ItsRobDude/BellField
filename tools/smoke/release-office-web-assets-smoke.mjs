import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const timestamp = new Date().toISOString();
const runId = timestamp.replace(/[:.]/g, '-');
const releaseRoot = path.resolve(getArgValue('--release-root') || path.join(repoRoot, 'release'));
const evidenceDir =
  getArgValue('--evidence-dir') ||
  process.env.BELLFIELD_SMOKE_ARTIFACT_DIR ||
  path.join(repoRoot, 'artifacts', 'validation', runId);
const evidencePath = path.join(evidenceDir, 'release-office-web-assets-smoke.json');
const nodeExe = firstExisting([
  path.join(releaseRoot, 'runtime', 'node', process.platform === 'win32' ? 'node.exe' : 'node'),
  process.execPath
]);
const officeServer = firstExisting([
  path.join(releaseRoot, 'apps', 'office-web', 'server.js'),
  path.join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
]);

const evidence = {
  name: 'Release office-web static asset smoke',
  startedAt: timestamp,
  releaseRoot,
  checks: [],
  assets: []
};

let child;
let stdout = '';
let stderr = '';

try {
  check('release root exists', existsSync(releaseRoot), { releaseRoot });
  check('bundled node runtime exists', existsSync(nodeExe), { nodeExe });
  check('office standalone server exists', Boolean(officeServer), { officeServer });

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const officeRoot = path.dirname(officeServer);
  evidence.officeRoot = officeRoot;
  evidence.baseUrl = baseUrl;

  child = spawn(nodeExe, ['server.js'], {
    cwd: officeRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3001'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  evidence.process = { pid: child.pid };

  const htmlResponse = await fetchUntilReady(baseUrl, 20_000);
  const html = await htmlResponse.text();
  check('office root returns HTML', htmlResponse.status === 200, { status: htmlResponse.status });

  const scriptPaths = [...new Set(html.match(/\/_next\/static\/[^"'<> ]+\.js/g) ?? [])];
  check('office HTML references Next static JavaScript', scriptPaths.length > 0, {
    count: scriptPaths.length
  });

  for (const scriptPath of scriptPaths) {
    const assetResponse = await fetch(`${baseUrl}${scriptPath}`);
    const contentType = assetResponse.headers.get('content-type') ?? '';
    const asset = {
      path: scriptPath,
      status: assetResponse.status,
      contentType
    };
    evidence.assets.push(asset);
    check('Next static JavaScript asset is served', assetResponse.status === 200, asset);
  }

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  recordProcessOutput();
  await writeEvidence();
  console.log(`Release office-web asset smoke passed. Evidence: ${evidencePath}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  recordProcessOutput();
  await writeEvidence();
  console.error(`Release office-web asset smoke failed. Evidence: ${evidencePath}`);
  throw error;
} finally {
  await stopChildProcess(child);
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function firstExisting(paths) {
  const existing = paths.find((candidate) => candidate && existsSync(candidate));
  if (!existing) {
    throw new Error(`None of these paths exist: ${paths.filter(Boolean).join(', ')}`);
  }
  return existing;
}

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a local TCP port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function fetchUntilReady(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Office server did not become ready: ${lastError?.message ?? 'timeout'}`);
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(`${name} failed: ${JSON.stringify(details)}`);
  }
}

async function writeEvidence() {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function recordProcessOutput() {
  if (!child) {
    return;
  }
  evidence.process = {
    ...evidence.process,
    exitCode: child.exitCode,
    signalCode: child.signalCode,
    stdout: truncateForEvidence(stdout),
    stderr: truncateForEvidence(stderr)
  };
}

function truncateForEvidence(value) {
  const limit = 12_000;
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}\n[truncated ${value.length - limit} chars]`;
}

async function stopChildProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return;
  }

  processHandle.kill();
  if (await waitForExit(processHandle, 5_000)) {
    return;
  }

  forceKillProcessTree(processHandle.pid);
  await waitForExit(processHandle, 5_000);
}

async function waitForExit(processHandle, timeoutMs) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return true;
  }

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      processHandle.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }
    processHandle.once('exit', onExit);
  });
}

function forceKillProcessTree(pid) {
  if (!pid) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore']
      });
      return;
    }
    process.kill(pid, 'SIGKILL');
  } catch {
    // Best-effort cleanup; the smoke failure remains visible in the evidence.
  }
}
