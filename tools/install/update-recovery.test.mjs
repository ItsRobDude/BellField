import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectUpdateProcessIds,
  createUpdateRecoveryTracker,
  decideUpdateRecovery,
  updatePhases
} from './update-recovery.mjs';

test('update recovery tracker records phases, flags, paths, and copy snapshots', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });

  tracker.enter(updatePhases.staging);
  tracker.markServiceStopAttempted();
  tracker.setStagedReleasePath('C:\\BellField\\release.restore-stage-1');
  tracker.setPreUpdateBackupPath('C:\\BellField\\backups\\before-update');
  tracker.setRollbackReleasePath('C:\\BellField\\release.restore-rollback-1');
  tracker.markReleaseSwapped();
  tracker.markServicesStarted();

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.phase, updatePhases.staging);
  assert.equal(snapshot.serviceStopAttempted, true);
  assert.equal(snapshot.servicesStarted, true);
  assert.equal(snapshot.releaseSwapped, true);
  assert.equal(snapshot.stagedReleasePath, 'C:\\BellField\\release.restore-stage-1');
  assert.equal(snapshot.preUpdateBackupPath, 'C:\\BellField\\backups\\before-update');
  assert.equal(snapshot.rollbackReleasePath, 'C:\\BellField\\release.restore-rollback-1');

  snapshot.phase = updatePhases.completed;
  assert.equal(tracker.snapshot().phase, updatePhases.staging);
});

test('preflight failure does not restart untouched services', () => {
  const recovery = decideUpdateRecovery(
    createUpdateRecoveryTracker({ skipServices: false }).snapshot()
  );

  assert.equal(recovery.restartServices, false);
  assert.equal(recovery.postSwapFailure, false);
  assert.equal(recovery.message, null);
});

test('partial service stop failure restarts original services', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.enter(updatePhases.stoppingServices);
  tracker.markServiceStopAttempted();

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, true);
  assert.equal(recovery.postSwapFailure, false);
  assert.match(recovery.message, /before the installed release swap completed/);
  assert.doesNotMatch(recovery.message, /rollback release directory/);
});

test('process exit wait failure restarts original services', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.waitingForProcessExit);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, true);
  assert.equal(recovery.postSwapFailure, false);
  assert.match(recovery.message, /original app services/);
  assert.doesNotMatch(recovery.message, /rollback release directory/);
});

test('swappingRelease is still pre-swap and restarts original services', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.swappingRelease);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, true);
  assert.equal(recovery.postSwapFailure, false);
  assert.match(recovery.message, /before the installed release swap completed/);
  assert.doesNotMatch(recovery.message, /rollback release directory/);
});

test('releaseSwapped is post-swap and leaves services stopped', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, false);
  assert.equal(recovery.postSwapFailure, true);
  assert.match(recovery.message, /rollback release directory/);
  assert.match(recovery.message, /pre-update backup path/);
});

test('migration failure after release swap leaves services stopped', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);
  tracker.enter(updatePhases.migrating);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, false);
  assert.equal(recovery.postSwapFailure, true);
  assert.match(recovery.message, /App services are left stopped/);
});

test('postgres start failure after release swap leaves app services stopped', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);
  tracker.enter(updatePhases.startingPostgres);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, false);
  assert.equal(recovery.postSwapFailure, true);
  assert.match(recovery.message, /App services are left stopped/);
  assert.match(recovery.message, /rollback release directory/);
});

test('postgres-started migration boundary stays post-swap', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);
  tracker.enter(updatePhases.postgresStarted);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, false);
  assert.equal(recovery.postSwapFailure, true);
  assert.match(recovery.message, /pre-update backup path/);
});

test('service start failure retries service readiness with rollback guidance', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);
  tracker.enter(updatePhases.startingServices);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, true);
  assert.equal(recovery.postSwapFailure, true);
  assert.match(recovery.message, /retrying service readiness once/);
  assert.match(recovery.message, /rollback release directory/);
});

test('health failure retries service readiness with rollback guidance', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: false });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);
  tracker.enter(updatePhases.healthChecking);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, true);
  assert.equal(recovery.postSwapFailure, true);
  assert.match(recovery.message, /retrying service readiness once/);
  assert.match(recovery.message, /pre-update backup path/);
});

test('skip-services update failure never restarts services', () => {
  const tracker = createUpdateRecoveryTracker({ skipServices: true });
  tracker.markServiceStopAttempted();
  tracker.enter(updatePhases.releaseSwapped);

  const recovery = decideUpdateRecovery(tracker.snapshot());

  assert.equal(recovery.restartServices, false);
  assert.equal(recovery.postSwapFailure, false);
  assert.equal(recovery.message, null);
});

test('collectUpdateProcessIds normalizes PowerShell scalar and array shapes', () => {
  assert.deepEqual(
    collectUpdateProcessIds([
      {
        serviceProcessId: 100,
        processes: { processId: 101 }
      },
      {
        serviceProcessId: '102',
        processes: [{ processId: 103 }, { processId: '104' }]
      },
      {
        serviceProcessId: 0,
        processes: null
      },
      {
        serviceProcessId: undefined
      }
    ]),
    [100, 101, 102, 103, 104]
  );
});
