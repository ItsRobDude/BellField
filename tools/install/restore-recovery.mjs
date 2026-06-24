export const restorePhases = Object.freeze({
  preflight: 'preflight',
  staging: 'staging',
  stoppingServices: 'stoppingServices',
  servicesStopped: 'servicesStopped',
  resettingSchema: 'resettingSchema',
  schemaResetComplete: 'schemaResetComplete',
  databaseRestored: 'databaseRestored',
  filesSwapped: 'filesSwapped',
  migrationsRun: 'migrationsRun',
  startingServices: 'startingServices',
  completed: 'completed'
});

const restorePhaseOrder = Object.freeze(Object.values(restorePhases));
const restorePhaseRanks = new Map(restorePhaseOrder.map((phase, index) => [phase, index]));

export function createRestoreRecoveryTracker(input = {}) {
  const state = {
    phase: restorePhases.preflight,
    skipServices: Boolean(input.skipServices),
    serviceStopAttempted: false,
    servicesStarted: false
  };

  return {
    enter(phase) {
      assertRestorePhase(phase);
      state.phase = phase;
    },
    markServiceStopAttempted() {
      state.serviceStopAttempted = true;
    },
    markServicesStarted() {
      state.servicesStarted = true;
    },
    snapshot() {
      return { ...state };
    }
  };
}

export function decideRestoreRecovery(snapshot) {
  const phase = snapshot?.phase ?? restorePhases.preflight;
  assertRestorePhase(phase);

  if (snapshot?.skipServices || !snapshot?.serviceStopAttempted || snapshot?.servicesStarted) {
    return { restartServices: false, message: null };
  }

  if (phaseAtLeast(phase, restorePhases.startingServices)) {
    return {
      restartServices: true,
      message:
        'Restore data steps completed, but app services did not finish starting; retrying service start.'
    };
  }

  if (phaseAtLeast(phase, restorePhases.filesSwapped)) {
    return {
      restartServices: false,
      message:
        'Restore did not complete after media/license files were swapped; app services are left stopped because restored files or migrations may be inconsistent. Fix the restore error and rerun the same restore command before restarting API, worker, or office-web.'
    };
  }

  if (phaseAtLeast(phase, restorePhases.databaseRestored)) {
    return {
      restartServices: false,
      message:
        'Restore database completed but media/license swap or migrations did not complete; app services are left stopped because database and file state may be inconsistent. Fix the restore error and rerun the same restore command before restarting API, worker, or office-web.'
    };
  }

  if (phaseAtLeast(phase, restorePhases.schemaResetComplete)) {
    return {
      restartServices: false,
      message:
        'Restore did not complete after database schema reset finished; app services are left stopped because database restore did not complete. Fix the restore error and rerun the same restore command before restarting API, worker, or office-web.'
    };
  }

  return {
    restartServices: true,
    message:
      'Restore failed before database schema reset completed; attempting to restart app services.'
  };
}

function phaseAtLeast(phase, targetPhase) {
  return restorePhaseRanks.get(phase) >= restorePhaseRanks.get(targetPhase);
}

function assertRestorePhase(phase) {
  if (!restorePhaseRanks.has(phase)) {
    throw new Error(`Unknown restore phase: ${phase}`);
  }
}
