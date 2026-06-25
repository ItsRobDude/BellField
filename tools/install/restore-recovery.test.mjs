import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRestoreRecoveryTracker,
  decideRestoreRecovery,
  restorePhases
} from './restore-recovery.mjs';

function restoreSnapshot(phase, overrides = {}) {
  return {
    phase,
    skipServices: false,
    serviceStopAttempted: true,
    ...overrides
  };
}

test('restore recovery tracker records phase and service stop flag', () => {
  const tracker = createRestoreRecoveryTracker({ skipServices: true });
  const initialSnapshot = tracker.snapshot();

  assert.deepEqual(initialSnapshot, {
    phase: restorePhases.preflight,
    skipServices: true,
    serviceStopAttempted: false
  });

  initialSnapshot.phase = restorePhases.migrationsRun;
  assert.equal(tracker.snapshot().phase, restorePhases.preflight);

  tracker.enter(restorePhases.stoppingServices);
  tracker.markServiceStopAttempted();

  assert.deepEqual(tracker.snapshot(), {
    phase: restorePhases.stoppingServices,
    skipServices: true,
    serviceStopAttempted: true
  });
});

test('preflight failure does not restart untouched services', () => {
  assert.deepEqual(
    decideRestoreRecovery(
      restoreSnapshot(restorePhases.preflight, { serviceStopAttempted: false })
    ),
    { restartServices: false, message: null }
  );
});

test('partial service stop failure restarts services', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.stoppingServices));

  assert.equal(recovery.restartServices, true);
  assert.match(recovery.message, /before database schema reset completed/i);
});

test('schema reset failure restarts services', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.resettingSchema));

  assert.equal(recovery.restartServices, true);
  assert.match(recovery.message, /before database schema reset completed/i);
});

test('pg_restore failure after schema reset leaves app services stopped', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.schemaResetComplete));

  assert.equal(recovery.restartServices, false);
  assert.match(recovery.message, /database restore did not complete/i);
});

test('failure after database restore leaves app services stopped for file consistency', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.databaseRestored));

  assert.equal(recovery.restartServices, false);
  assert.match(
    recovery.message,
    /database completed but media\/license swap or migrations did not complete/i
  );
  assert.match(recovery.message, /database and file state may be inconsistent/i);
  assert.doesNotMatch(recovery.message, /database restore did not complete/i);
});

test('migration failure after media and license swap leaves app services stopped', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.filesSwapped));

  assert.equal(recovery.restartServices, false);
  assert.match(recovery.message, /media\/license/i);
  assert.match(recovery.message, /migrations/i);
});

test('failure after migrations leaves app services stopped before readiness handling', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.migrationsRun));

  assert.equal(recovery.restartServices, false);
  assert.match(recovery.message, /media\/license/i);
  assert.match(recovery.message, /migrations/i);
});
