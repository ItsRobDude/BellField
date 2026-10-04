import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { packetLimits } from './evidence/packet-reader.mjs';
import { formatEvidenceReview, reviewEvidence, runEvidenceCli } from './review-evidence.mjs';

const script = fileURLToPath(new URL('./review-evidence.mjs', import.meta.url));
const stamp = (seconds = 0) => new Date(Date.UTC(2026, 6, 8, 0, 0, seconds)).toISOString();
const gate = (event, fields = {}, seconds = 0) => ({
  timestamp: stamp(seconds),
  event: `BELLFIELD_GATE_ADMIN_${event}`,
  runId: 'rerun-30',
  mode: 'gate3-update',
  ...fields
});
const update = (event, fields = {}, seconds = 0) => ({
  timestamp: stamp(seconds),
  event: `BELLFIELD_UPDATE_${event}`,
  ...fields
});

function packet(t) {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-evidence-review-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
    return path;
  };
  const jsonl = (name, records) =>
    write(
      name,
      records
        .map((record) => (typeof record === 'string' ? record : JSON.stringify(record)))
        .join('\n')
    );
  return { root, write, jsonl };
}

test('reviews real runner/result sidecar shapes without reading or printing child output', (t) => {
  const p = packet(t);
  const stdoutPath = p.write('evidence/output/install.stdout.txt', 'private payload never emitted');
  const stderrPath = p.write('evidence/output/install.stderr.txt', '');
  p.jsonl('evidence/runner.jsonl', [
    gate('LAUNCH', { status: 'already-elevated-started', dryRun: false }),
    gate('STEP', { step: 'install', status: 'started' }, 1),
    gate('STEP', { step: 'install', status: 'progress', elapsedSeconds: 15 }, 16),
    gate(
      'STEP',
      { step: 'install', status: 'succeeded', result: { exitCode: 0, stdoutPath, stderrPath } },
      22
    ),
    gate('RESULT', { status: 'succeeded' }, 23)
  ]);
  const before = readFileSync(join(p.root, 'evidence/runner.jsonl'), 'utf8');
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 0);
  assert.equal(report.runs[0].steps[0].durationSeconds, 21);
  assert.equal(report.runs[0].steps[0].progressEvents, 1);
  assert.deepEqual(
    report.runs[0].sidecars.map((item) => item.status),
    ['present', 'present']
  );
  assert.equal(report.runs[0].terminal.source.line, 5);
  assert.ok(!JSON.stringify(report).includes('private payload'));
  assert.equal(readFileSync(join(p.root, 'evidence/runner.jsonl'), 'utf8'), before);
  assert.deepEqual(readdirSync(p.root), ['evidence']);
});

test('a passed smoke retains the explicit skipped runtime and never establishes clean-machine proof', (t) => {
  const p = packet(t);
  p.write('smoke.json', {
    name: 'Release ZIP smoke',
    startedAt: stamp(),
    completedAt: stamp(20),
    result: 'passed',
    zipPath: 'C:\\private\\release.zip',
    checks: [
      {
        name: 'release-build smoke passes against extracted ZIP',
        passed: true,
        details: { sourceCommit: 'abc1234', password: 'not-in-output' }
      }
    ],
    runtimeBootSmoke: 'skipped; pass --require-gate-day-deps=true to run it'
  });
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 0);
  assert.equal(report.runs[0].status, 'passed');
  assert.equal(report.runs[0].reportedScopes[0].status, 'skipped');
  assert.equal(report.metadata[0].sourceCommit, 'abc1234');
  assert.equal(report.metadata[0].verification, 'reported-only');
  assert.ok(!JSON.stringify(report).includes('C:\\private'));
  assert.ok(!JSON.stringify(report).includes('not-in-output'));
  assert.match(report.scope, /no artifact verification, execution, or clean-machine qualification/);
});

test('preserves failed, skipped, unattempted and unknown smoke checks', (t) => {
  const p = packet(t);
  p.write('smoke.json', {
    name: 'legacy smoke',
    status: 'failed',
    checks: [
      { name: 'failed', passed: false },
      { name: 'skip', status: 'skipped' },
      { name: 'not run', result: 'unattempted' },
      { name: 'missing' }
    ]
  });
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.deepEqual(
    report.runs[0].checks.map((check) => check.status),
    ['failed', 'skipped', 'unattempted', 'unknown']
  );
  assert.equal(report.undatedFailureCount, 1);
  assert.equal(report.earliestKnownFailure, null);
});

test('an early failed step stays visible despite a later succeeded terminal', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('STEP', { step: 'transcript', status: 'failed' }, 1),
    gate('RESULT', { status: 'succeeded' }, 4)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.runs[0].status, 'succeeded');
  assert.equal(report.exitCode, 1);
  assert.equal(report.earliestKnownFailure.step, 'transcript');
});

test('finds the earliest timestamped failure across independently grouped runs', (t) => {
  const p = packet(t);
  p.jsonl('a-later.jsonl', [gate('FAILURE', { status: 'failed', failingStep: 'restore' }, 30)]);
  p.jsonl('z-earlier.jsonl', [update('FAILURE', { status: 'failed', phase: 'migrating' }, 10)]);
  const report = reviewEvidence(p.root);
  assert.equal(report.runs.length, 2);
  assert.equal(report.earliestKnownFailure.step, 'migrating');
  assert.equal(report.earliestKnownFailure.source.file, 'z-earlier.jsonl');
});

test('runner invocations remain separate by runId/mode and repeated launch', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('LAUNCH', { status: 'already-elevated-started' }),
    gate('STEP', { status: 'started', step: 'update' }, 1),
    gate('LAUNCH', { status: 'already-elevated-started' }, 20),
    gate('RESULT', { status: 'succeeded' }, 21),
    gate('RESULT', { status: 'succeeded', mode: 'gate1-admin-install' }, 22),
    gate('RESULT', { status: 'succeeded', runId: 'rerun-31' }, 23)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.runs.length, 4);
  assert.equal(report.runs[0].terminal, null);
  assert.ok(report.issues.some((issue) => issue.code === 'missing-terminal'));
  assert.equal(report.exitCode, 1);
});

test('updater phases are observations, and expired-window refusal is preserved as rejected', (t) => {
  const p = packet(t);
  p.jsonl('update.jsonl', [
    update('LOG', { status: 'opened' }),
    update('REJECTED', { status: 'rejected', reason: 'update-window-expired' }, 1)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 0);
  assert.equal(report.runs[0].status, 'rejected');
  assert.equal(report.earliestKnownFailure, null);
  assert.equal(report.runs[0].steps.length, 0);
});

test('real durable updater phase/terminal schemas retain recovery clues', (t) => {
  const p = packet(t);
  p.jsonl('update.jsonl', [
    update('LOG', { status: 'opened' }),
    update('PHASE', { phase: 'migrating' }, 1),
    update('PHASE', { phase: 'healthChecking' }, 6),
    update('RESULT', { status: 'succeeded', readinessRecovered: true, version: '0.1.0' }, 40)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 0);
  assert.deepEqual(
    report.runs[0].steps.map((step) => step.status),
    ['observed', 'observed']
  );
  assert.equal(report.runs[0].timing[0].clue, 'readiness-recovered');
});

test('malformed and legacy-prefixed JSONL records retain safe line pointers', (t) => {
  const p = packet(t);
  p.jsonl('mixed.jsonl', [
    'BELLFIELD_UPDATE_PHASE ' + JSON.stringify({ timestamp: stamp(), phase: 'staging' }),
    '{"secret":"truncated-secret',
    JSON.stringify(update('RESULT', { status: 'succeeded' }, 10)),
    'older free text not silently accepted'
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.deepEqual(
    report.issues
      .filter((issue) => issue.code === 'malformed-jsonl-record')
      .map((issue) => issue.source.line),
    [2, 4]
  );
  assert.equal(report.runs[0].status, 'succeeded');
  assert.ok(!JSON.stringify(report).includes('truncated-secret'));
});

test('missing terminal and missing referenced sidecars require attention', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('STEP', { step: 'update', status: 'started', stdoutPath: 'missing.stdout.txt' })
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'missing-terminal'));
  assert.ok(report.issues.some((issue) => issue.code === 'sidecar-missing'));
});

test('outside-root sidecar references are rejected without touching or revealing external paths', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('STEP', {
      status: 'succeeded',
      step: 'install',
      result: {
        stdoutPath: '../outside-secret.txt',
        stderrPath: 'C:\\private\\password=externalSecret\\stderr.txt'
      }
    }),
    gate('RESULT', { status: 'succeeded' })
  ]);
  const report = reviewEvidence(p.root);
  assert.deepEqual(
    report.runs[0].sidecars.map((sidecar) => sidecar.status),
    ['outside-root', 'outside-root']
  );
  assert.ok(!JSON.stringify(report).includes('externalSecret'));
  assert.ok(!JSON.stringify(report).includes('outside-secret'));
});

test('junctions are not traversed and a root through a junction is rejected', (t) => {
  const p = packet(t);
  const external = packet(t);
  external.write('sensitive.json', { sourceCommit: 'a'.repeat(40) });
  const link = join(p.root, 'linked');
  symlinkSync(external.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  p.jsonl('runner.jsonl', [
    gate('STEP', { status: 'succeeded', step: 'probe', stdoutPath: 'linked/sensitive.json' }),
    gate('RESULT', { status: 'succeeded' })
  ]);
  const report = reviewEvidence(p.root);
  assert.ok(report.issues.some((issue) => issue.code === 'link-skipped'));
  assert.ok(report.issues.some((issue) => issue.code === 'sidecar-link-skipped'));
  assert.equal(report.metadata.length, 0);
  assert.throws(() => reviewEvidence(link), /no symbolic-link or junction/);
});

test('output redacts secret-shaped values in allowlisted labels and omits raw errors and payloads', (t) => {
  const p = packet(t);
  const secret = ['bfrt1', 'superPrivateCredentialValue'].join('_');
  p.jsonl('runner.jsonl', [
    gate('FAILURE', {
      status: 'failed',
      failingStep: `probe ${secret}`,
      runId: `password=hiddenPassword`,
      error: { message: 'barePrivateValue', stack: 'raw-stack' },
      stdoutTail: 'raw-output',
      command: 'sensitive-command',
      arguments: ['private-argument']
    })
  ]);
  const report = reviewEvidence(p.root);
  for (const output of [JSON.stringify(report), formatEvidenceReview(report)]) {
    for (const value of [
      secret,
      'hiddenPassword',
      'barePrivateValue',
      'raw-stack',
      'raw-output',
      'sensitive-command',
      'private-argument'
    ])
      assert.ok(!output.includes(value), value);
    assert.ok(output.includes('[REDACTED]'));
  }
});

test('bounded traversal/file reads and record counts cannot silently yield a complete verdict', (t) => {
  const p = packet(t);
  p.write('large.json', ' '.repeat(200));
  p.jsonl('runner.jsonl', [gate('RESULT', { status: 'succeeded' })]);
  const size = reviewEvidence(p.root, { ...packetLimits, fileBytes: 100 });
  assert.equal(size.exitCode, 1);
  assert.ok(size.issues.some((issue) => issue.code === 'file-size-limit'));
  const count = reviewEvidence(p.root, { ...packetLimits, entries: 1 });
  assert.ok(count.issues.some((issue) => issue.code === 'entry-limit'));
  const records = reviewEvidence(p.root, { ...packetLimits, records: 0 });
  assert.ok(records.issues.some((issue) => issue.code === 'record-limit'));
});

test('reports heartbeat gaps, explicit stalls, timeout, and clock reversal as clues', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('STEP', { step: 'update', status: 'started' }),
    gate('STEP', { step: 'update', status: 'progress' }, 15),
    gate('STEP', { step: 'update', status: 'system-stall-detected', stallSeconds: 90 }, 105),
    gate('STEP', { step: 'update', status: 'progress' }, 110),
    gate('STEP', { step: 'update', status: 'failed', result: { timedOut: true } }, 109),
    gate('FAILURE', { status: 'failed', failingStep: 'update' }, 111)
  ]);
  const report = reviewEvidence(p.root);
  const clues = report.runs[0].timing.map((item) => item.clue);
  for (const clue of [
    'heartbeat-gap',
    'reported-system-stall',
    'reported-timeout',
    'clock-moved-backward'
  ])
    assert.ok(clues.includes(clue));
  assert.match(report.timingCaution, /not a diagnosis/);
});

test('reported artifact/source metadata stays unverified and malformed identity is not invented', (t) => {
  const p = packet(t);
  p.write('manifest.json', {
    schemaVersion: 1,
    artifactKind: 'bellfield-server-release',
    build: {
      version: '0.1.0',
      buildKind: 'release',
      sourceCommit: 'abcdef1',
      releaseDate: '2026-07-08'
    },
    files: [{ path: 'private', sha256: 'a'.repeat(64) }],
    privateKey: 'never-emitted'
  });
  p.write('source-summary.json', {
    sourceCommit: 'untrusted-not-a-commit',
    artifacts: [{ version: '0.2.0', sha256: 'b'.repeat(64) }]
  });
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1); // Metadata alone is not a completed run.
  assert.ok(report.metadata.some((value) => value.sourceCommit === 'abcdef1'));
  assert.ok(report.metadata.some((value) => value.sha256 === 'b'.repeat(64)));
  assert.ok(!JSON.stringify(report).includes('untrusted-not-a-commit'));
  assert.ok(!JSON.stringify(report).includes('never-emitted'));
  assert.ok(!JSON.stringify(report).includes('a'.repeat(64)));
});

test('private credential directories and non-JSON sidecars are excluded', (t) => {
  const p = packet(t);
  p.write('private-relay-config/secrets.json', '{broken private credentials');
  p.write('stdout.txt', '{broken output');
  p.jsonl('runner.jsonl', [gate('RESULT', { status: 'succeeded' })]);
  assert.equal(reviewEvidence(p.root).exitCode, 0);
});

test('CLI supports pnpm separator, JSON/text, and consistent process exit codes', (t) => {
  const p = packet(t);
  p.write('smoke.json', {
    name: 'smoke',
    result: 'passed',
    checks: [{ name: 'one', passed: true }]
  });
  assert.equal(runEvidenceCli(['--', '--root', p.root, '--json']).exitCode, 0);
  assert.match(runEvidenceCli([`--root=${p.root}`]).output, /Evidence review: reviewed/);
  assert.equal(runEvidenceCli([]).exitCode, 2);
  assert.equal(runEvidenceCli(['--root', p.root, '--unknown']).exitCode, 2);
  assert.equal(
    runEvidenceCli(['--root', join(p.root, 'missing-private-path'), '--json']).exitCode,
    2
  );
  assert.equal(runEvidenceCli(['--root', join(p.root, 'smoke.json')]).exitCode, 2);
  const result = spawnSync(process.execPath, [script, '--root', p.root, '--json'], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).reviewStatus, 'reviewed');
  p.write('smoke.json', {
    name: 'failed',
    result: 'failed',
    checks: [{ name: 'one', passed: false }]
  });
  const failed = spawnSync(process.execPath, [script, '--root', p.root, '--json'], {
    encoding: 'utf8'
  });
  assert.equal(failed.status, 1);
  assert.equal(JSON.parse(failed.stdout).reviewStatus, 'needs-attention');
  assert.equal(resolve(script), script);
});

test('M9/jobs API smoke request steps expose the failure without request or response payloads', (t) => {
  const p = packet(t);
  p.write('jobs.json', {
    name: 'Jobs/appointments lifecycle API smoke',
    startedAt: stamp(),
    completedAt: stamp(20),
    status: 'failed',
    steps: [
      { name: 'GET /health', status: 'passed', httpStatus: 200 },
      {
        name: 'POST /identity/auth/login',
        status: 'failed',
        httpStatus: 401,
        error: 'private-response'
      }
    ],
    checks: [],
    created: { sessionEmployee: 'private-person@example.test' }
  });
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.equal(report.runs[0].firstFailure.step, 'POST /identity/auth/login');
  assert.equal(report.runs[0].steps[1].httpStatus, 401);
  assert.equal(report.runs[0].firstFailure.source.field, 'steps[1]');
  assert.match(formatEvidenceReview(report), /failed: POST \/identity\/auth\/login/);
  assert.ok(!JSON.stringify(report).includes('private-response'));
  assert.ok(!JSON.stringify(report).includes('private-person'));
});

test('earliest known failure uses all timestamps despite out-of-order events in one run', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('STEP', { step: 'later-in-time', status: 'failed' }, 40),
    gate('STEP', { step: 'earlier-in-time', status: 'failed' }, 10),
    gate('FAILURE', { failingStep: 'terminal', status: 'failed' }, 41)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.runs[0].firstFailure.step, 'later-in-time');
  assert.equal(report.earliestKnownFailure.step, 'earlier-in-time');
  assert.ok(report.runs[0].timing.some((clue) => clue.clue === 'clock-moved-backward'));
});

test('gate coverage describes mode presence only and text reports unknown provenance', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('LAUNCH', { status: 'dry-run-started', dryRun: true }),
    gate('STEP', { step: 'update', status: 'skipped', reason: 'dry-run' }, 1),
    gate('RESULT', { status: 'succeeded' }, 2)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.gateCoverage[2].observedModes, ['gate3-update']);
  assert.deepEqual(report.gateCoverage[1].notObservedInPacket, ['gate2-backup-restore']);
  assert.equal(report.gateCoverage[4].assessment, 'not-assessed-manual-or-external-evidence');
  assert.match(formatEvidenceReview(report), /Unknown: no supported identity metadata/);
  assert.match(formatEvidenceReview(report), /Dry run: reported/);
  assert.match(report.coverageCaution, /not globally unattempted/);
});

test('text reports known source identity but does not associate it with unrelated runs', (t) => {
  const p = packet(t);
  p.write('manifest.json', { sourceCommit: 'abcdef123', version: '0.1.0' });
  p.write('smoke.json', { name: 'smoke', result: 'passed', checks: [] });
  const report = reviewEvidence(p.root);
  assert.match(formatEvidenceReview(report), /sourceCommit=abcdef123/);
  assert.match(formatEvidenceReview(report), /Reported provenance \(not verified or inferred\)/);
  assert.equal(report.runs[0].sourceCommit, undefined);
});

test('malformed smoke array variants are evidence gaps rather than crashing or disappearing', (t) => {
  const p = packet(t);
  p.write('bad.json', { name: 'bad', result: 'passed', checks: [], steps: {} });
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'malformed-smoke-arrays'));
});

test('the runner first-owner browser boundary requires human action despite a terminal record', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('STEP', {
      mode: 'gate1-admin-install',
      step: 'verify-first-owner-in-browser',
      status: 'needs-human-action'
    }),
    gate('RESULT', { mode: 'gate1-admin-install', status: 'needs-human-action' }, 1)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.equal(report.runs[0].status, 'needs-human-action');
  assert.notEqual(report.runs[0].terminal, null);
  assert.equal(report.earliestKnownFailure, null);
});

test('UAC timeout and successful retry remain distinct without treating normal elevation as a separate run', (t) => {
  const p = packet(t);
  p.jsonl('runner.jsonl', [
    gate('LAUNCH', { status: 'uac-requested' }),
    gate('LAUNCH', { status: 'uac-timeout' }, 1),
    gate('LAUNCH', { status: 'uac-requested' }, 2),
    gate('LAUNCH', { status: 'elevated-child-started' }, 3),
    gate('LAUNCH', { status: 'uac-approved' }, 4),
    gate('RESULT', { status: 'succeeded' }, 5),
    gate('LAUNCH', { status: 'elevated-child-completed' }, 6)
  ]);
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 1);
  assert.equal(report.runs.length, 2);
  assert.equal(report.runs[0].terminal, null);
  assert.equal(report.runs[1].status, 'succeeded');
  assert.ok(report.issues.some((issue) => issue.code === 'uac-timeout'));
  assert.equal(report.earliestKnownFailure, null);
  assert.match(formatEvidenceReview(report), /Launch: uac-timeout/);
});

test('nested corpus and process capture skip flags are not promoted by wrapper passed booleans', (t) => {
  const p = packet(t);
  p.write('install-helper.json', {
    name: 'Install helper smoke',
    result: 'passed',
    checks: [
      {
        name: 'PowerShell redactor removes every redaction fixture secret',
        passed: true,
        details: {
          skipped: true,
          reason: 'PowerShell not available on this platform',
          secret: 'not-output'
        }
      }
    ]
  });
  p.write('runner-smoke.json', {
    name: 'Gate Day admin runner smoke',
    result: 'passed',
    checks: [],
    processCaptureSmoke: {
      skipped: true,
      reason: 'process-capture-smoke requires Windows powershell.exe'
    }
  });
  const report = reviewEvidence(p.root);
  assert.equal(report.exitCode, 0);
  assert.equal(report.runs[0].checks[0].status, 'skipped');
  assert.equal(report.runs[0].checks[0].reportedStatus, 'passed');
  assert.equal(report.runs[1].reportedScopes[0].status, 'skipped');
  assert.match(formatEvidenceReview(report), /skipped: PowerShell redactor/);
  assert.ok(!JSON.stringify(report).includes('not-output'));
});
