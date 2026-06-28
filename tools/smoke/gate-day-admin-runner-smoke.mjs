import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeSmokeEvidence } from './smoke-evidence.mjs';

const evidence = {
  name: 'Gate Day admin runner smoke',
  startedAt: new Date().toISOString(),
  checks: []
};

const root = mkdtempSync(path.join(tmpdir(), 'bellfield-gate-admin-runner-smoke-'));

try {
  const powershell = findPowerShellCommand();
  if (!powershell) {
    if (process.platform === 'win32') {
      throw new Error('PowerShell was not available for Gate Day admin runner smoke');
    }
    evidence.skipped = true;
    evidence.reason = 'PowerShell not available on this platform';
    evidence.completedAt = new Date().toISOString();
    evidence.result = 'skipped';
    console.log(JSON.stringify(evidence, null, 2));
    console.log(`Evidence: ${writeSmokeEvidence(evidence, 'gate-day-admin-runner-smoke.json')}`);
    process.exit(0);
  }

  const installRoot = path.join(root, 'BellField');
  const releaseRoot = path.join(root, 'release');
  const evidenceRootBase = path.join(root, 'evidence root with spaces');
  const evidenceRoot = evidenceRootBase + path.sep;
  const runner = path.resolve('tools', 'install', 'run-gate-day-admin.ps1');

  const result = spawnSync(
    powershell,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      runner,
      '-Mode',
      'collect-only',
      '-InstallRoot',
      installRoot,
      '-ReleaseRoot',
      releaseRoot,
      '-EvidenceRoot',
      evidenceRoot,
      '-RunId',
      'smoke',
      '-NoSelfElevate',
      '-DryRun'
    ],
    {
      encoding: 'utf8',
      shell: false,
      timeout: 60_000
    }
  );

  check('dry-run collect-only exits successfully', result.status === 0, {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  });

  const usbLogPath = path.join(evidenceRootBase, 'gate-day-admin-runner-smoke.jsonl');
  const localLogPath = path.join(
    installRoot,
    'data',
    'logs',
    'gate-day',
    'gate-day-admin-runner-smoke.jsonl'
  );
  check('runner writes USB JSONL evidence', existsSync(usbLogPath), { usbLogPath });
  check('runner writes local JSONL evidence', existsSync(localLogPath), { localLogPath });

  const usbEvents = readJsonLines(usbLogPath);
  const localEvents = readJsonLines(localLogPath);
  evidence.usbLogPath = usbLogPath;
  evidence.localLogPath = localLogPath;
  evidence.trailingEvidenceRoot = evidenceRoot;
  evidence.events = usbEvents.map((event) => event.event);

  check(
    'USB and local logs contain parseable events',
    usbEvents.length > 0 && localEvents.length > 0,
    {
      usbEventCount: usbEvents.length,
      localEventCount: localEvents.length
    }
  );
  check(
    'runner records launch, step, and terminal result events',
    usbEvents.some((event) => event.event === 'BELLFIELD_GATE_ADMIN_LAUNCH') &&
      usbEvents.some((event) => event.event === 'BELLFIELD_GATE_ADMIN_STEP') &&
      usbEvents.some((event) => event.event === 'BELLFIELD_GATE_ADMIN_RESULT'),
    { events: evidence.events }
  );
  check(
    'dry-run collect-only records skipped read-only collector steps',
    usbEvents.some(
      (event) =>
        event.event === 'BELLFIELD_GATE_ADMIN_STEP' &&
        event.step === 'collect-service-evidence' &&
        event.status === 'skipped'
    ) &&
      usbEvents.some(
        (event) =>
          event.event === 'BELLFIELD_GATE_ADMIN_STEP' &&
          event.step === 'collect-update-evidence' &&
          event.status === 'skipped'
      )
  );
  check(
    'runner evidence does not include setup token fields',
    !readFileSync(usbLogPath, 'utf8').includes('setupToken') &&
      !readFileSync(localLogPath, 'utf8').includes('setupToken')
  );
  check(
    'dry-run accepts evidence root with spaces and a trailing separator',
    evidenceRoot.endsWith(path.sep) && existsSync(usbLogPath),
    { evidenceRoot, usbLogPath }
  );

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'gate-day-admin-runner-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'gate-day-admin-runner-smoke.json')}`);
  process.exitCode = 1;
} finally {
  rmSync(root, { force: true, recursive: true });
}

function findPowerShellCommand() {
  for (const command of ['powershell.exe', 'pwsh']) {
    const result = spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000
    });
    if (!result.error && result.status === 0) {
      return command;
    }
  }
  return null;
}

function readJsonLines(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(`Check failed: ${name}`);
  }
}
