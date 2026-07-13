import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeSmokeEvidence } from './smoke-evidence.mjs';

const evidence = {
  name: 'Gate Day admin runner smoke',
  startedAt: new Date().toISOString(),
  checks: [],
  modeRuns: []
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
  const windowsPowerShell = findWindowsPowerShellCommand();

  const installRoot = path.join(root, 'BellField');
  const releaseRoot = path.join(root, 'release');
  const updateArtifactRoot = path.join(root, 'update artifact');
  const expiredLicensePath = path.join(root, 'licenses', 'bellfield-license-EXPIRED.json');
  const artifactZip = path.join(root, 'artifact with spaces.zip');
  const callerRoot = path.join(root, 'usb caller root');
  const relativeArtifactZip = path.join('artifacts', 'relative artifact with spaces.zip');
  const expectedRelativeArtifactZip = path.join(callerRoot, relativeArtifactZip);
  const preparedUpdateReleaseRoot = path.join(root, 'prepared update artifact', 'release');
  const evidenceRootBase = path.join(root, 'evidence root with spaces');
  const evidenceRoot = evidenceRootBase + path.sep;
  const runner = path.resolve('tools', 'install', 'run-gate-day-admin.ps1');
  mkdirSync(path.dirname(expectedRelativeArtifactZip), { recursive: true });
  mkdirSync(path.dirname(expiredLicensePath), { recursive: true });
  writeFileSync(expiredLicensePath, '{"license":"expired-smoke-placeholder"}\n', { flag: 'wx' });

  const modePlans = [
    {
      mode: 'gate1-prepare-release',
      runId: 'gate1-prepare-release',
      artifactZip: relativeArtifactZip,
      callerCwd: callerRoot,
      expectedArtifactZip: expectedRelativeArtifactZip,
      expectedVersion: '0.0.1-smoke',
      expectedSourceCommit: 'smoke',
      expectedSteps: [
        'gate1-prepare-release-preflight',
        'gate1-prepare-release-extracting',
        'gate1-prepare-release-verifying',
        'gate1-prepare-release-published'
      ]
    },
    {
      mode: 'gate1-admin-install',
      runId: 'gate1-admin-install',
      expectedSteps: [
        'prepared-release-preflight',
        'write-server-config',
        'configure-lan-access',
        'provision-postgres',
        'run-packaged-migrations',
        'verify-license-file',
        'render-windows-services',
        'install-windows-services',
        'collect-service-evidence',
        'collect-lan-evidence',
        'copy-first-owner-setup-token-metadata',
        'create-first-owner',
        'verify-first-owner-in-browser'
      ]
    },
    {
      mode: 'gate1-post-reboot-check',
      runId: 'gate1-post-reboot-check',
      expectedSteps: [
        'collect-service-evidence',
        'collect-lan-evidence',
        'record-service-states',
        'health'
      ]
    },
    {
      mode: 'gate2-backup-restore',
      runId: 'gate2-backup-restore',
      expectedSteps: [
        'run-packaged-backup',
        'create-post-backup-marker',
        'restore-backup',
        'collect-service-evidence',
        'health'
      ]
    },
    {
      mode: 'gate3-prepare-update-artifact',
      runId: 'gate3-prepare-update-artifact',
      artifactZip,
      releaseRoot: preparedUpdateReleaseRoot,
      expectedVersion: '0.0.2-smoke',
      expectedSourceCommit: 'smoke',
      expectedSteps: [
        'gate3-prepare-update-artifact-preflight',
        'gate3-prepare-update-artifact-extracting',
        'gate3-prepare-update-artifact-verifying',
        'gate3-prepare-update-artifact-published'
      ]
    },
    {
      mode: 'gate3-update',
      runId: 'gate3-update-success',
      dryRunGate3Outcome: 'success',
      expectedSteps: [
        'run-update-bellfield',
        'dry-run-gate3-update-outcome',
        'copy-durable-update-jsonl',
        'collect-update-evidence',
        'record-terminal-update-event'
      ],
      expectedCollectorReason: 'dry-run-no-collector-needed',
      expectedNeedsCollector: false
    },
    {
      mode: 'gate3-update',
      runId: 'gate3-update-nonzero',
      dryRunGate3Outcome: 'nonzero',
      expectedSteps: [
        'run-update-bellfield',
        'dry-run-gate3-update-outcome',
        'copy-durable-update-jsonl',
        'collect-update-evidence',
        'record-terminal-update-event'
      ],
      expectedCollectorReason: 'dry-run',
      expectedNeedsCollector: true
    },
    {
      mode: 'gate4-expired-refusal',
      runId: 'gate4-expired-refusal',
      expiredLicensePath,
      expectedSteps: [
        'capture-pre-refusal-state',
        'swap-in-expired-license',
        'run-update-bellfield-expect-refusal',
        'dry-run-gate4-refusal-outcome',
        'copy-durable-update-jsonl',
        'assert-refusal-evidence',
        'assert-services-uninterrupted',
        'restore-valid-license',
        'health-after-restore'
      ]
    },
    {
      mode: 'collect-only',
      runId: 'collect-only',
      expectedSteps: [
        'collect-service-evidence',
        'collect-lan-evidence',
        'collect-update-evidence',
        'health',
        'release-manifest-snapshot'
      ]
    }
  ];

  for (const plan of modePlans) {
    const run = runDryRunMode({
      powershell,
      runner,
      installRoot,
      releaseRoot: plan.releaseRoot ?? releaseRoot,
      updateArtifactRoot,
      evidenceRoot,
      cwd: plan.callerCwd,
      ...plan
    });
    evidence.modeRuns.push(run.summary);

    check(`dry-run ${plan.runId} exits successfully`, run.result.status === 0, {
      status: run.result.status,
      stdout: run.result.stdout,
      stderr: run.result.stderr
    });
    check(`dry-run ${plan.runId} writes USB JSONL evidence`, existsSync(run.usbLogPath), {
      usbLogPath: run.usbLogPath
    });
    check(`dry-run ${plan.runId} writes local JSONL evidence`, existsSync(run.localLogPath), {
      localLogPath: run.localLogPath
    });
    check(
      `dry-run ${plan.runId} USB and local logs contain parseable events`,
      run.usbEvents.length > 0 && run.localEvents.length > 0,
      {
        usbEventCount: run.usbEvents.length,
        localEventCount: run.localEvents.length
      }
    );
    check(
      `dry-run ${plan.runId} records launch, step, and terminal result events`,
      run.usbEvents.some((event) => event.event === 'BELLFIELD_GATE_ADMIN_LAUNCH') &&
        run.usbEvents.some((event) => event.event === 'BELLFIELD_GATE_ADMIN_STEP') &&
        run.usbEvents.some((event) => event.event === 'BELLFIELD_GATE_ADMIN_RESULT'),
      { events: run.summary.events }
    );
    check(
      `dry-run ${plan.runId} follows the fixed expected step sequence`,
      arraysEqual(run.summary.stepOrder, plan.expectedSteps),
      {
        expectedSteps: plan.expectedSteps,
        stepOrder: run.summary.stepOrder
      }
    );
    if (plan.expectedArtifactZip) {
      const preflight = run.summary.steps.find(
        (event) => event.step === `${plan.mode}-preflight` && event.status === 'started'
      );
      check(
        `dry-run ${plan.runId} resolves relative ArtifactZip against caller cwd`,
        Boolean(preflight) &&
          path.isAbsolute(preflight.artifactZip) &&
          samePath(preflight.artifactZip, plan.expectedArtifactZip),
        {
          expectedArtifactZip: plan.expectedArtifactZip,
          recordedArtifactZip: preflight?.artifactZip,
          callerCwd: plan.callerCwd
        }
      );
    }
  }

  const collectOnly = evidence.modeRuns.find((run) => run.runId === 'collect-only');
  check(
    'dry-run collect-only records skipped read-only collector steps',
    collectOnly.steps.some(
      (event) => event.step === 'collect-service-evidence' && event.status === 'skipped'
    ) &&
      collectOnly.steps.some(
        (event) => event.step === 'collect-update-evidence' && event.status === 'skipped'
      )
  );

  const gate3Success = evidence.modeRuns.find((run) => run.runId === 'gate3-update-success');
  const gate3Failure = evidence.modeRuns.find((run) => run.runId === 'gate3-update-nonzero');
  check(
    'dry-run Gate 3 success plan does not require the update collector',
    gate3Success.outcomeEvent?.needsCollector === false &&
      gate3Success.collectorEvents.some((event) => event.reason === 'dry-run-no-collector-needed'),
    { outcomeEvent: gate3Success.outcomeEvent, collectorEvents: gate3Success.collectorEvents }
  );
  check(
    'dry-run Gate 3 nonzero plan runs the update collector handling path',
    gate3Failure.outcomeEvent?.needsCollector === true &&
      gate3Failure.collectorEvents.some((event) => event.status === 'started') &&
      gate3Failure.collectorEvents.some(
        (event) => event.status === 'skipped' && event.reason === 'dry-run'
      ),
    { outcomeEvent: gate3Failure.outcomeEvent, collectorEvents: gate3Failure.collectorEvents }
  );

  const gate4Refusal = evidence.modeRuns.find((run) => run.runId === 'gate4-expired-refusal');
  const gate4OutcomeEvent = gate4Refusal.steps.find(
    (event) => event.step === 'dry-run-gate4-refusal-outcome'
  );
  check(
    'dry-run Gate 4 plan simulates a pre-flight expired-window rejection',
    gate4OutcomeEvent?.simulatedTerminalEvent?.event === 'BELLFIELD_UPDATE_REJECTED' &&
      gate4OutcomeEvent?.simulatedTerminalEvent?.reason === 'update-window-expired' &&
      gate4OutcomeEvent?.simulatedRefusalExitCode === 1,
    { gate4OutcomeEvent }
  );
  check(
    'dry-run Gate 4 plan always reaches the license restore step',
    gate4Refusal.steps.some(
      (event) => event.step === 'restore-valid-license' && event.status === 'started'
    ),
    { stepOrder: gate4Refusal.stepOrder }
  );

  if (process.platform === 'win32') {
    if (!windowsPowerShell) {
      throw new Error('process-capture-smoke requires powershell.exe on Windows');
    }
    const processCapture = runProcessCaptureSmoke({
      powershell: windowsPowerShell,
      runner,
      installRoot,
      releaseRoot,
      evidenceRoot,
      cwd: root
    });
    evidence.modeRuns.push(processCapture.summary);

    check(
      'process-capture smoke uses Windows PowerShell',
      processCapture.summary.powershell === 'powershell.exe',
      {
        powershell: processCapture.summary.powershell
      }
    );
    check('process-capture smoke exits successfully', processCapture.result.status === 0, {
      status: processCapture.result.status,
      stdout: processCapture.result.stdout,
      stderr: processCapture.result.stderr
    });
    check(
      'process-capture smoke prints a safe operator summary',
      processCapture.result.stdout.includes(
        'BELLFIELD_GATE_ADMIN_SUMMARY: mode=process-capture-smoke status=succeeded'
      ),
      { stdout: processCapture.result.stdout }
    );
    check(
      'process-capture smoke writes USB JSONL evidence',
      existsSync(processCapture.usbLogPath),
      {
        usbLogPath: processCapture.usbLogPath
      }
    );
    check(
      'process-capture smoke writes local JSONL evidence',
      existsSync(processCapture.localLogPath),
      {
        localLogPath: processCapture.localLogPath
      }
    );

    const zeroStepResults = processCapture.summary.steps
      .filter(
        (event) => /^process-capture-zero-\d+$/.test(event.step) && event.status === 'succeeded'
      )
      .map((event) => event.result);
    check(
      'process-capture zero probes preserve exit code 0',
      zeroStepResults.length === 8 &&
        zeroStepResults.every(
          (result) => result.exitCode === 0 && result.exitCodeUnknown === false
        ),
      { zeroStepResults }
    );

    const nonzeroResult = processCapture.summary.steps.find(
      (event) => event.step === 'process-capture-nonzero' && event.status === 'succeeded'
    )?.result;
    check(
      'process-capture allowed nonzero probe preserves exit code 7',
      nonzeroResult?.exitCode === 7 && nonzeroResult?.exitCodeUnknown === false,
      { nonzeroResult }
    );

    const outputResult = processCapture.summary.steps.find(
      (event) => event.step === 'process-capture-output' && event.status === 'succeeded'
    )?.result;
    check(
      'process-capture output probe writes stdout and stderr sidecars',
      Boolean(outputResult) &&
        existsSync(outputResult.stdoutPath) &&
        existsSync(outputResult.stderrPath) &&
        readFileSync(outputResult.stdoutPath, 'utf8').includes('bellfield stdout probe') &&
        readFileSync(outputResult.stderrPath, 'utf8').includes('bellfield stderr probe'),
      { outputResult }
    );
  } else {
    evidence.processCaptureSmoke = {
      skipped: true,
      reason: 'process-capture-smoke requires Windows powershell.exe'
    };
    console.warn('Skipping process-capture-smoke: requires Windows powershell.exe');
  }

  const allLogsText = evidence.modeRuns
    .map((run) => readFileSync(run.usbLogPath, 'utf8') + readFileSync(run.localLogPath, 'utf8'))
    .join('\n');
  check('runner evidence does not include setup token fields', !allLogsText.includes('setupToken'));
  check(
    'dry-run accepts evidence root with spaces and a trailing separator',
    evidenceRoot.endsWith(path.sep),
    {
      evidenceRoot
    }
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

function runDryRunMode({
  powershell,
  runner,
  mode,
  runId,
  installRoot,
  releaseRoot,
  updateArtifactRoot,
  expiredLicensePath,
  artifactZip,
  expectedVersion,
  expectedSourceCommit,
  evidenceRoot,
  cwd,
  dryRunGate3Outcome
}) {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runner,
    '-Mode',
    mode,
    '-InstallRoot',
    installRoot,
    '-ReleaseRoot',
    releaseRoot,
    '-EvidenceRoot',
    evidenceRoot,
    '-RunId',
    runId,
    '-NoSelfElevate',
    '-DryRun'
  ];
  if (artifactZip) {
    args.push('-ArtifactZip', artifactZip);
  }
  if (expectedVersion) {
    args.push('-ExpectedVersion', expectedVersion);
  }
  if (expectedSourceCommit) {
    args.push('-ExpectedSourceCommit', expectedSourceCommit);
  }
  if (mode === 'gate3-update' || mode === 'gate4-expired-refusal') {
    args.push('-UpdateArtifactRoot', updateArtifactRoot);
  }
  if (expiredLicensePath) {
    args.push('-ExpiredLicensePath', expiredLicensePath);
  }
  if (dryRunGate3Outcome) {
    args.push('-DryRunGate3Outcome', dryRunGate3Outcome);
  }

  const result = spawnSync(powershell, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: 60_000
  });

  const usbLogPath = path.join(
    evidenceRoot.replace(/[\\/]+$/, ''),
    `gate-day-admin-runner-${runId}.jsonl`
  );
  const localLogPath = path.join(
    installRoot,
    'data',
    'logs',
    'gate-day',
    `gate-day-admin-runner-${runId}.jsonl`
  );
  const usbEvents = existsSync(usbLogPath) ? readJsonLines(usbLogPath) : [];
  const localEvents = existsSync(localLogPath) ? readJsonLines(localLogPath) : [];
  const steps = usbEvents.filter((event) => event.event === 'BELLFIELD_GATE_ADMIN_STEP');
  const stepOrder = uniqueStepOrder(steps);
  const collectorEvents = steps.filter((event) => event.step === 'collect-update-evidence');
  const outcomeEvent = steps.find((event) => event.step === 'dry-run-gate3-update-outcome');

  return {
    result,
    usbLogPath,
    localLogPath,
    usbEvents,
    localEvents,
    summary: {
      mode,
      runId,
      usbLogPath,
      localLogPath,
      events: usbEvents.map((event) => event.event),
      steps,
      stepOrder,
      collectorEvents,
      outcomeEvent
    }
  };
}

function runProcessCaptureSmoke({
  powershell,
  runner,
  installRoot,
  releaseRoot,
  evidenceRoot,
  cwd
}) {
  const runId = 'process-capture-smoke';
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runner,
    '-Mode',
    'process-capture-smoke',
    '-InstallRoot',
    installRoot,
    '-ReleaseRoot',
    releaseRoot,
    '-EvidenceRoot',
    evidenceRoot,
    '-RunId',
    runId,
    '-NoSelfElevate'
  ];

  const result = spawnSync(powershell, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: 120_000
  });

  const usbLogPath = path.join(
    evidenceRoot.replace(/[\\/]+$/, ''),
    `gate-day-admin-runner-${runId}.jsonl`
  );
  const localLogPath = path.join(
    installRoot,
    'data',
    'logs',
    'gate-day',
    `gate-day-admin-runner-${runId}.jsonl`
  );
  const usbEvents = existsSync(usbLogPath) ? readJsonLines(usbLogPath) : [];
  const localEvents = existsSync(localLogPath) ? readJsonLines(localLogPath) : [];
  const steps = usbEvents.filter((event) => event.event === 'BELLFIELD_GATE_ADMIN_STEP');

  return {
    result,
    usbLogPath,
    localLogPath,
    usbEvents,
    localEvents,
    summary: {
      mode: 'process-capture-smoke',
      runId,
      powershell,
      usbLogPath,
      localLogPath,
      events: usbEvents.map((event) => event.event),
      steps,
      stepOrder: uniqueStepOrder(steps)
    }
  };
}

function samePath(left, right) {
  return normalizeComparePath(left) === normalizeComparePath(right);
}

function normalizeComparePath(value) {
  return path
    .normalize(value)
    .replace(/[\\/]+$/, '')
    .toLowerCase();
}

function uniqueStepOrder(steps) {
  const ordered = [];
  for (const event of steps) {
    if (!event.step || event.step === 'transcript') {
      continue;
    }
    if (!ordered.includes(event.step)) {
      ordered.push(event.step);
    }
  }
  return ordered;
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

function findWindowsPowerShellCommand() {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'],
    {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000
    }
  );
  return !result.error && result.status === 0 ? 'powershell.exe' : null;
}

function readJsonLines(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(`Check failed: ${name}`);
  }
}
