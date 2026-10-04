import { safeText } from './packet-reader.mjs';

const terminalEvents = new Set([
  'BELLFIELD_GATE_ADMIN_RESULT',
  'BELLFIELD_GATE_ADMIN_FAILURE',
  'BELLFIELD_UPDATE_RESULT',
  'BELLFIELD_UPDATE_FAILURE',
  'BELLFIELD_UPDATE_FATAL',
  'BELLFIELD_UPDATE_LOCKED',
  'BELLFIELD_UPDATE_REJECTED'
]);
const knownStatuses = new Set([
  'succeeded',
  'passed',
  'failed',
  'fatal',
  'blocked',
  'rejected',
  'skipped',
  'unattempted',
  'unknown',
  'started',
  'progress',
  'needs-human-action',
  'system-stall-detected',
  'exit-code-unknown',
  'attention-missed'
]);
const failureStatuses = new Set(['failed', 'fatal']);
const runnerStarts = new Set([
  'elevated-child-started',
  'dry-run-started',
  'non-elevated-prepare-started',
  'already-elevated-started'
]);
const launchStatuses = new Set([
  ...runnerStarts,
  'uac-requested',
  'uac-approved',
  'uac-timeout',
  'uac-cancelled',
  'child-wait-failed',
  'child-exit-code-unknown',
  'child-exit-evidence-missing',
  'elevated-child-completed'
]);
const launchGaps = new Set([
  'uac-timeout',
  'uac-cancelled',
  'child-wait-failed',
  'child-exit-code-unknown',
  'child-exit-evidence-missing'
]);
const time = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const status = (value) => (knownStatuses.has(value) ? value : 'unknown');
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function identity(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const key of ['version', 'buildKind', 'artifactKind']) {
    if (typeof value[key] === 'string') result[key] = safeText(value[key], 100);
  }
  if (typeof value.sourceCommit === 'string' && /^[a-f0-9]{7,40}$/i.test(value.sourceCommit))
    result.sourceCommit = value.sourceCommit;
  if (typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.sha256))
    result.sha256 = value.sha256;
  if (typeof value.releaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.releaseDate))
    result.releaseDate = value.releaseDate;
  return result;
}

export function summarizePacket(packet) {
  const runs = [];
  const failures = [];
  const metadata = [];
  const issues = packet.issues;
  let records = 0;
  let unsupportedFiles = 0;
  let recordLimit = false;
  const addIssue = (code, source) => issues.push({ code, severity: 'warning', source });
  const addIdentity = (value, source) => {
    const fields = identity(value);
    if (Object.keys(fields).length)
      metadata.push({ ...fields, source, verification: 'reported-only' });
  };
  const recordFailure = (run, failure) => {
    run.firstFailure ??= failure;
    failures.push(failure);
  };

  function processEvents(entries, file) {
    const groups = new Map();
    const fileRuns = [];
    for (const { value, source } of entries) {
      if (
        !isRecord(value) ||
        typeof value.event !== 'string' ||
        !/^BELLFIELD_(GATE_ADMIN|UPDATE)_/.test(value.event)
      ) {
        addIssue('unsupported-event', source);
        continue;
      }
      const kind = value.event.startsWith('BELLFIELD_GATE_ADMIN_') ? 'runner' : 'updater';
      const key = kind === 'runner' ? JSON.stringify([value.runId, value.mode]) : 'updater';
      let run = groups.get(key);
      const starts =
        kind === 'runner' ? runnerStarts.has(value.status) : value.event === 'BELLFIELD_UPDATE_LOG';
      const requestsElevation =
        value.event === 'BELLFIELD_GATE_ADMIN_LAUNCH' && value.status === 'uac-requested';
      if (
        !run ||
        (starts && (run.terminal || run.started)) ||
        (requestsElevation && (run.elevationRequested || run.started || run.terminal))
      ) {
        run = {
          kind,
          source: { file: source.file },
          runId: safeText(value.runId),
          mode: safeText(value.mode),
          status: 'unknown',
          terminal: null,
          steps: [],
          sidecars: [],
          timing: [],
          launchEvents: [],
          firstFailure: null,
          started: false,
          startedAt: null,
          endedAt: null,
          dryRun: false
        };
        groups.set(key, run);
        runs.push(run);
        fileRuns.push(run);
      }
      if (requestsElevation) run.elevationRequested = true;
      if (starts) run.started = true;
      if (value.dryRun === true) run.dryRun = true;
      const timestamp = time(value.timestamp);
      if (!timestamp)
        addIssue(value.timestamp === undefined ? 'missing-timestamp' : 'invalid-timestamp', source);
      if (timestamp) {
        if (!run.startedAt) run.startedAt = timestamp;
        if (run.endedAt && timestamp < run.endedAt)
          run.timing.push({ clue: 'clock-moved-backward', source });
        run.endedAt = timestamp;
      }
      const eventStatus = status(value.status);
      if (value.event === 'BELLFIELD_GATE_ADMIN_LAUNCH' && launchStatuses.has(value.status)) {
        run.launchEvents.push({ status: value.status, timestamp, source });
        if (launchGaps.has(value.status)) addIssue(value.status, source);
      }
      if (terminalEvents.has(value.event)) {
        run.status = eventStatus;
        run.terminal = { event: value.event, status: eventStatus, timestamp, source };
        if (eventStatus === 'unknown') addIssue('unknown-terminal-status', source);
      }
      if (failureStatuses.has(eventStatus)) {
        const failure = {
          step: safeText(value.step ?? value.failingStep ?? value.phase),
          status: eventStatus,
          timestamp,
          source
        };
        recordFailure(run, failure);
      }
      if (value.event.endsWith('_STEP') || value.event === 'BELLFIELD_UPDATE_PHASE') {
        const name = safeText(value.step ?? value.phase) ?? '(unnamed)';
        let step = run.steps.findLast((entry) => entry.name === name);
        if (
          !step ||
          (eventStatus === 'started' &&
            ['succeeded', 'passed', 'failed', 'skipped'].includes(step.status))
        ) {
          step = {
            name,
            status: 'unknown',
            source,
            lastSource: source,
            startedAt: timestamp,
            endedAt: timestamp,
            durationSeconds: null,
            progressEvents: 0,
            observedStatuses: []
          };
          run.steps.push(step);
        }
        if (eventStatus === 'progress') {
          step.progressEvents++;
          if (step.lastProgressAt && timestamp) {
            const gapSeconds = (Date.parse(timestamp) - Date.parse(step.lastProgressAt)) / 1000;
            if (gapSeconds > 45)
              run.timing.push({ clue: 'heartbeat-gap', gapSeconds, step: name, source });
          }
          step.lastProgressAt = timestamp;
        }
        step.status = value.event === 'BELLFIELD_UPDATE_PHASE' ? 'observed' : eventStatus;
        step.lastSource = source;
        step.endedAt = timestamp;
        if (!step.observedStatuses.includes(step.status)) step.observedStatuses.push(step.status);
        if (step.startedAt && timestamp && timestamp >= step.startedAt)
          step.durationSeconds = (Date.parse(timestamp) - Date.parse(step.startedAt)) / 1000;
        if (eventStatus === 'system-stall-detected')
          run.timing.push({
            clue: 'reported-system-stall',
            stallSeconds: number(value.stallSeconds),
            step: name,
            source
          });
      }
      if (value.readinessRecovered === true)
        run.timing.push({ clue: 'readiness-recovered', source });
      if (value.status === 'keep-awake-unavailable')
        run.timing.push({ clue: 'keep-awake-unavailable', source });
      for (const payload of [value, value.result]) {
        if (!isRecord(payload)) continue;
        addIdentity(payload, source);
        if (payload.timedOut === true) run.timing.push({ clue: 'reported-timeout', source });
        if (payload.exitCodeUnknown === true)
          run.timing.push({ clue: 'exit-code-unknown', source });
        for (const field of ['stdoutPath', 'stderrPath', 'transcriptPath']) {
          if (payload[field] === undefined) continue;
          const sidecar = { field, ...packet.sidecar(payload[field], file), source };
          if (!run.sidecars.some((entry) => JSON.stringify(entry) === JSON.stringify(sidecar)))
            run.sidecars.push(sidecar);
          if (sidecar.status !== 'present') addIssue(`sidecar-${sidecar.status}`, source);
        }
      }
    }
    for (const run of fileRuns) {
      if (!run.terminal) addIssue('missing-terminal', run.source);
    }
  }

  function processSmoke(value, source) {
    const run = {
      kind: 'smoke',
      name: safeText(value.name),
      source,
      status: status(value.result ?? value.status),
      startedAt: time(value.startedAt),
      endedAt: time(value.completedAt),
      checks: [],
      steps: [],
      reportedScopes: [],
      firstFailure: null
    };
    if (!['passed', 'succeeded', 'failed', 'skipped', 'unattempted'].includes(run.status))
      addIssue('missing-or-unknown-smoke-result', source);
    for (const [index, step] of (value.steps ?? []).entries()) {
      if (!takeRecord(source)) break;
      const stepSource = { ...source, field: `steps[${index}]` };
      if (!isRecord(step)) {
        addIssue('malformed-step', stepSource);
        continue;
      }
      const stepStatus = status(step.status ?? step.result);
      const summary = { name: safeText(step.name), status: stepStatus, source: stepSource };
      if (number(step.httpStatus) !== null) summary.httpStatus = step.httpStatus;
      run.steps.push(summary);
      if (stepStatus === 'unknown') addIssue('unknown-step-status', stepSource);
      if (failureStatuses.has(stepStatus))
        recordFailure(run, {
          step: summary.name,
          status: stepStatus,
          timestamp: time(step.timestamp),
          source: stepSource
        });
    }
    for (const [index, check] of (value.checks ?? []).entries()) {
      if (!takeRecord(source)) break;
      const checkSource = { ...source, field: `checks[${index}]` };
      if (!isRecord(check)) {
        addIssue('malformed-check', checkSource);
        continue;
      }
      const reportedStatus =
        typeof check.passed === 'boolean'
          ? check.passed
            ? 'passed'
            : 'failed'
          : status(check.status ?? check.result);
      const explicitlySkipped = check.details?.skipped === true;
      const checkStatus =
        explicitlySkipped && reportedStatus !== 'failed' ? 'skipped' : reportedStatus;
      run.checks.push({
        name: safeText(check.name),
        status: checkStatus,
        source: checkSource,
        ...(explicitlySkipped ? { reportedStatus, execution: 'skipped' } : {})
      });
      if (checkStatus === 'unknown') addIssue('unknown-check-status', checkSource);
      if (failureStatuses.has(checkStatus))
        recordFailure(run, {
          step: safeText(check.name),
          status: checkStatus,
          timestamp: null,
          source: checkSource
        });
      addIdentity(check.details, checkSource);
    }
    // Current release ZIP smoke intentionally permits this narrower pass.
    if (typeof value.runtimeBootSmoke === 'string' && /^skipped\b/.test(value.runtimeBootSmoke)) {
      run.reportedScopes.push({
        name: 'runtimeBootSmoke',
        status: 'skipped',
        source: { ...source, field: 'runtimeBootSmoke' }
      });
    }
    if (value.processCaptureSmoke?.skipped === true) {
      run.reportedScopes.push({
        name: 'processCaptureSmoke',
        status: 'skipped',
        source: { ...source, field: 'processCaptureSmoke.skipped' }
      });
    }
    if (failureStatuses.has(run.status) && !run.firstFailure)
      recordFailure(run, { step: null, status: run.status, timestamp: run.endedAt, source });
    addIdentity(value, source);
    runs.push(run);
  }

  function takeRecord(source) {
    if (++records <= packet.limits.records) return true;
    if (!recordLimit) addIssue('record-limit', source);
    recordLimit = true;
    return false;
  }

  for (const file of packet.files) {
    if (recordLimit) break;
    const text = packet.read(file);
    if (text === null) continue;
    const source = { file: packet.pointer(file) };
    if (/\.jsonl$/i.test(file)) {
      const entries = [];
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        const lineSource = { ...source, line: index + 1 };
        if (!takeRecord(lineSource)) break;
        try {
          const prefixed = /^(BELLFIELD_(?:UPDATE|GATE_ADMIN)_[A-Z_]+)\s+(\{.*)$/s.exec(
            line.trim()
          );
          const value = JSON.parse(prefixed ? prefixed[2] : line);
          entries.push({
            value: prefixed ? { ...value, event: prefixed[1] } : value,
            source: lineSource
          });
        } catch {
          addIssue('malformed-jsonl-record', lineSource);
        }
      }
      processEvents(entries, file);
      continue;
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      addIssue('malformed-json', source);
      continue;
    }
    if (!takeRecord(source)) break;
    if (isRecord(value) && (Array.isArray(value.checks) || Array.isArray(value.steps))) {
      if (
        (value.checks !== undefined && !Array.isArray(value.checks)) ||
        (value.steps !== undefined && !Array.isArray(value.steps))
      ) {
        addIssue('malformed-smoke-arrays', source);
      } else processSmoke(value, source);
    } else if (isRecord(value) && typeof value.event === 'string')
      processEvents([{ value, source }], file);
    else {
      const before = metadata.length;
      addIdentity(value, source);
      addIdentity(value?.build, { ...source, field: 'build' });
      if (Array.isArray(value?.artifacts)) {
        for (const [index, artifact] of value.artifacts.entries()) {
          if (!takeRecord(source)) break;
          addIdentity(artifact, { ...source, field: `artifacts[${index}]` });
        }
      }
      if (metadata.length === before) unsupportedFiles++;
    }
  }
  const timedFailures = failures
    .filter((failure) => failure.timestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!runs.length) addIssue('no-supported-run-evidence', { file: '.' });
  for (const run of runs) {
    delete run.started;
    delete run.elevationRequested;
    for (const step of run.steps ?? []) delete step.lastProgressAt;
  }
  const hasReadErrors = issues.some((entry) => entry.severity === 'read-error');
  const needsAttention =
    issues.length > 0 ||
    failures.length > 0 ||
    runs.some(
      (run) =>
        ['blocked', 'unknown', 'attention-missed', 'needs-human-action'].includes(run.status) ||
        (run.steps ?? []).some((step) => step.status === 'needs-human-action')
    );
  const gateModes = [
    ['gate1-prepare-release', 'gate1-admin-install', 'gate1-post-reboot-check'],
    ['gate2-backup-restore'],
    ['gate3-prepare-update-artifact', 'gate3-update'],
    ['gate4-expired-refusal']
  ];
  const observedModes = new Set(runs.filter((run) => run.kind === 'runner').map((run) => run.mode));
  return {
    schemaVersion: 1,
    reviewStatus: needsAttention ? 'needs-attention' : 'reviewed',
    exitCode: hasReadErrors ? 2 : needsAttention ? 1 : 0,
    scope:
      'Reported evidence only; no artifact verification, execution, or clean-machine qualification.',
    limits: packet.limits,
    counts: {
      ...packet.counts,
      records: Math.min(records, packet.limits.records),
      unsupportedFiles
    },
    runs,
    metadata,
    gateCoverage: gateModes
      .map((modes, index) => ({
        gate: index + 1,
        observedModes: modes.filter((mode) => observedModes.has(mode)),
        notObservedInPacket: modes.filter((mode) => !observedModes.has(mode))
      }))
      .concat({ gate: 5, assessment: 'not-assessed-manual-or-external-evidence' }),
    coverageCaution:
      'Mode presence is not a gate pass; absence only means not observed in this supplied packet, not globally unattempted.',
    issues,
    earliestKnownFailure: timedFailures[0] ?? null,
    undatedFailureCount: failures.filter((failure) => !failure.timestamp).length,
    timingCaution:
      'Clock and heartbeat gaps are clues, not a diagnosis of sleep or product failure.'
  };
}
