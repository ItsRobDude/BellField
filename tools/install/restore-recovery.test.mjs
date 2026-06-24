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
    servicesStarted: false,
    ...overrides
  };
}

test('restore recovery tracker records phase and service flags', () => {
  const tracker = createRestoreRecoveryTracker({ skipServices: true });
  const initialSnapshot = tracker.snapshot();

  assert.deepEqual(initialSnapshot, {
    phase: restorePhases.preflight,
    skipServices: true,
    serviceStopAttempted: false,
    servicesStarted: false
  });

  initialSnapshot.phase = restorePhases.completed;
  assert.equal(tracker.snapshot().phase, restorePhases.preflight);

  tracker.enter(restorePhases.stoppingServices);
  tracker.markServiceStopAttempted();
  tracker.markServicesStarted();

  assert.deepEqual(tracker.snapshot(), {
    phase: restorePhases.stoppingServices,
    skipServices: true,
    serviceStopAttempted: true,
    servicesStarted: true
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

test('migration failure after media and license swap leaves app services stopped', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.filesSwapped));

  assert.equal(recovery.restartServices, false);
  assert.match(recovery.message, /media\/license/i);
  assert.match(recovery.message, /migrations/i);
});

test('service start failure reports service recovery instead of database corruption', () => {
  const recovery = decideRestoreRecovery(restoreSnapshot(restorePhases.startingServices));

  assert.equal(recovery.restartServices, true);
  assert.match(recovery.message, /services did not finish starting/i);
  assert.doesNotMatch(recovery.message, /database.*inconsistent/i);
  assert.doesNotMatch(recovery.message, /database.*restore/i);
});
