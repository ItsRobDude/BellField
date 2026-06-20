import { Logger } from '@nestjs/common';
import type { IdentityAccessRepository } from './identity-access.repository';
import {
  assertIdentityAttemptRateLimit,
  recordFailedIdentityAttempt,
  resetIdentityAttemptPruneCadenceForTests
} from './identity-login-throttle';
import {
  firstOwnerSetupAttemptThrottlePolicy,
  firstOwnerSetupFailureThreshold,
  firstOwnerSetupLockoutMessage,
  identityAttemptPruneIntervalMs,
  loginAttemptThrottlePolicy,
  loginFailureThreshold,
  loginLockoutMessage
} from './login-attempt-policy';

function makeRepository() {
  return {
    findIdentityAttemptState: jest.fn().mockResolvedValue(null),
    recordFailedIdentityAttempt: jest.fn().mockResolvedValue({
      failedCount: 1,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:00:00.000Z'
    }),
    pruneStaleIdentityAttemptStates: jest.fn().mockResolvedValue(undefined)
  } as unknown as jest.Mocked<
    Pick<
      IdentityAccessRepository,
      'findIdentityAttemptState' | 'recordFailedIdentityAttempt' | 'pruneStaleIdentityAttemptStates'
    >
  >;
}

describe('identity attempt throttle cleanup cadence', () => {
  beforeEach(() => {
    resetIdentityAttemptPruneCadenceForTests();
    jest.restoreAllMocks();
  });

  it('records the failed identity attempt before pruning stale rows', async () => {
    const repository = makeRepository();
    const policy = loginAttemptThrottlePolicy('owner@example.com');
    const callOrder: string[] = [];
    repository.recordFailedIdentityAttempt.mockImplementationOnce(async () => {
      callOrder.push('record');
      return {
        failedCount: 1,
        windowStartedAt: '2026-06-19T12:00:00.000Z',
        lastFailedAt: '2026-06-19T12:00:00.000Z'
      };
    });
    repository.pruneStaleIdentityAttemptStates.mockImplementationOnce(async () => {
      callOrder.push('prune');
    });

    await recordFailedIdentityAttempt(
      repository as unknown as IdentityAccessRepository,
      policy,
      new Date('2026-06-19T12:00:00.000Z')
    );

    expect(callOrder).toEqual(['record', 'prune']);
  });

  it('prunes at most once per process-local interval', async () => {
    const repository = makeRepository();
    const policy = loginAttemptThrottlePolicy('owner@example.com');

    await recordFailedIdentityAttempt(
      repository as unknown as IdentityAccessRepository,
      policy,
      new Date('2026-06-19T12:00:00.000Z')
    );
    await recordFailedIdentityAttempt(
      repository as unknown as IdentityAccessRepository,
      policy,
      new Date('2026-06-19T12:05:00.000Z')
    );
    await recordFailedIdentityAttempt(
      repository as unknown as IdentityAccessRepository,
      policy,
      new Date(new Date('2026-06-19T12:00:00.000Z').getTime() + identityAttemptPruneIntervalMs)
    );

    expect(repository.recordFailedIdentityAttempt).toHaveBeenCalledTimes(3);
    expect(repository.pruneStaleIdentityAttemptStates).toHaveBeenCalledTimes(2);
  });

  it('throws the login lockout on the threshold failure', async () => {
    const repository = makeRepository();
    const policy = loginAttemptThrottlePolicy('owner@example.com');
    repository.recordFailedIdentityAttempt.mockResolvedValueOnce({
      failedCount: loginFailureThreshold,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:04:00.000Z',
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });

    await expect(
      recordFailedIdentityAttempt(
        repository as unknown as IdentityAccessRepository,
        policy,
        new Date('2026-06-19T12:04:00.000Z')
      )
    ).rejects.toMatchObject({ status: 429, message: loginLockoutMessage });
  });

  it('records setup threshold failures but blocks only on a later assertion', async () => {
    const repository = makeRepository();
    const policy = firstOwnerSetupAttemptThrottlePolicy();
    repository.recordFailedIdentityAttempt.mockResolvedValueOnce({
      failedCount: firstOwnerSetupFailureThreshold,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:04:00.000Z',
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });

    await expect(
      recordFailedIdentityAttempt(
        repository as unknown as IdentityAccessRepository,
        policy,
        new Date('2026-06-19T12:04:00.000Z')
      )
    ).resolves.toBeUndefined();

    repository.findIdentityAttemptState.mockResolvedValueOnce({
      failedCount: firstOwnerSetupFailureThreshold,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:04:00.000Z',
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });

    await expect(
      assertIdentityAttemptRateLimit(
        repository as unknown as IdentityAccessRepository,
        policy,
        new Date('2026-06-19T12:04:00.000Z')
      )
    ).rejects.toMatchObject({ status: 429, message: firstOwnerSetupLockoutMessage });
  });

  it('keeps the lockout response when best-effort prune fails', async () => {
    const repository = makeRepository();
    const policy = loginAttemptThrottlePolicy('owner@example.com');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository.recordFailedIdentityAttempt.mockResolvedValueOnce({
      failedCount: loginFailureThreshold,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:04:00.000Z',
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });
    repository.pruneStaleIdentityAttemptStates.mockRejectedValueOnce(new Error('prune down'));

    await expect(
      recordFailedIdentityAttempt(
        repository as unknown as IdentityAccessRepository,
        policy,
        new Date('2026-06-19T12:04:00.000Z')
      )
    ).rejects.toMatchObject({ status: 429, message: loginLockoutMessage });
    expect(repository.pruneStaleIdentityAttemptStates).toHaveBeenCalledTimes(1);
  });
});
