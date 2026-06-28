const orderedUpdatePhases = [
  'preflight',
  'verifying',
  'staging',
  'staged',
  'preparingStagedServices',
  'stagedServicesPrepared',
  'backingUp',
  'backupComplete',
  'stoppingServices',
  'servicesStopped',
  'waitingForProcessExit',
  'processesExited',
  'swappingRelease',
  'releaseSwapped',
  'startingPostgres',
  'postgresStarted',
  'migrating',
  'migrationsRun',
  'startingServices',
  'healthChecking',
  'completed'
];

export const updatePhases = Object.freeze(
  Object.fromEntries(orderedUpdatePhases.map((phase) => [phase, phase]))
);

const phaseOrder = new Map(orderedUpdatePhases.map((phase, index) => [phase, index]));

export function createUpdateRecoveryTracker({ skipServices = false } = {}) {
  const state = {
    phase: updatePhases.preflight,
    skipServices,
    serviceStopAttempted: false,
    servicesStarted: false,
    releaseSwapped: false,
    stagedReleasePath: null,
    rollbackReleasePath: null,
    preUpdateBackupPath: null
  };

  return {
    enter(phase) {
      assertKnownPhase(phase);
      state.phase = phase;
      if (phase === updatePhases.releaseSwapped) {
        state.releaseSwapped = true;
      }
    },
    markServiceStopAttempted() {
      state.serviceStopAttempted = true;
    },
    markServicesStarted() {
      state.servicesStarted = true;
    },
    markReleaseSwapped() {
      state.releaseSwapped = true;
    },
    setStagedReleasePath(path) {
      state.stagedReleasePath = path ?? null;
    },
    setRollbackReleasePath(path) {
      state.rollbackReleasePath = path ?? null;
    },
    setPreUpdateBackupPath(path) {
      state.preUpdateBackupPath = path ?? null;
    },
    snapshot() {
      return { ...state };
    }
  };
}

export function decideUpdateRecovery(snapshot) {
  const phase = snapshot?.phase ?? updatePhases.preflight;
  assertKnownPhase(phase);

  if (snapshot?.skipServices || !snapshot?.serviceStopAttempted || snapshot?.servicesStarted) {
    return { restartServices: false, postSwapFailure: false, message: null };
  }

  if (isAtOrAfter(phase, updatePhases.startingServices)) {
    return {
      restartServices: true,
      postSwapFailure: true,
      message:
        'Update release swap completed, but services did not finish starting or passing health; retrying service readiness once. If readiness still fails, use the rollback release directory and pre-update backup path in the failure summary before retrying.'
    };
  }

  if (snapshot?.releaseSwapped || isAtOrAfter(phase, updatePhases.releaseSwapped)) {
    return {
      restartServices: false,
      postSwapFailure: true,
      message:
        'Update changed the installed release before failing. App services are left stopped; use the rollback release directory and pre-update backup path in the failure summary before retrying.'
    };
  }

  return {
    restartServices: true,
    postSwapFailure: false,
    message:
      'Update failed before the installed release swap completed; attempting to restart the original app services.'
  };
}

export function collectUpdateProcessIds(processTree) {
  const ids = new Set();
  for (const entry of normalizePowerShellArray(processTree)) {
    const serviceProcessId = Number(entry?.serviceProcessId);
    if (Number.isInteger(serviceProcessId) && serviceProcessId > 0) {
      ids.add(serviceProcessId);
    }
    for (const process of normalizePowerShellArray(entry?.processes)) {
      const processId = Number(process?.processId);
      if (Number.isInteger(processId) && processId > 0) {
        ids.add(processId);
      }
    }
  }
  return [...ids];
}

export function normalizePowerShellArray(value) {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function compareUpdatePhases(left, right) {
  assertKnownPhase(left);
  assertKnownPhase(right);
  return phaseOrder.get(left) - phaseOrder.get(right);
}

function isAtOrAfter(phase, boundary) {
  return compareUpdatePhases(phase, boundary) >= 0;
}

function assertKnownPhase(phase) {
  if (!phaseOrder.has(phase)) {
    throw new Error(`Unknown update phase: ${phase}`);
  }
}
