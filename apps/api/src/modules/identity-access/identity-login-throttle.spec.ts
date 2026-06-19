import { Logger } from '@nestjs/common';
import type { IdentityAccessRepository } from './identity-access.repository';
import {
  recordFailedLoginAttempt,
  resetLoginAttemptPruneCadenceForTests
} from './identity-login-throttle';
import {
  loginAttemptPruneIntervalMs,
  loginFailureThreshold,
  loginLockoutMessage
} from './login-attempt-policy';

function makeRepository() {
  return {
    findLoginAttemptState: jest.fn().mockResolvedValue(null),
    recordFailedLoginAttempt: jest.fn().mockResolvedValue({
      failedCount: 1,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:00:00.000Z'
    }),
    pruneStaleLoginAttemptStates: jest.fn().mockResolvedValue(undefined)
  } as unknown as jest.Mocked<
    Pick<
      IdentityAccessRepository,
      'findLoginAttemptState' | 'recordFailedLoginAttempt' | 'pruneStaleLoginAttemptStates'
    >
  >;
}

describe('identity login throttle cleanup cadence', () => {
  beforeEach(() => {
    resetLoginAttemptPruneCadenceForTests();
    jest.restoreAllMocks();
  });

  it('records the failed login before pruning stale rows', async () => {
    const repository = makeRepository();
    const callOrder: string[] = [];
    repository.recordFailedLoginAttempt.mockImplementationOnce(async () => {
      callOrder.push('record');
      return {
        failedCount: 1,
        windowStartedAt: '2026-06-19T12:00:00.000Z',
        lastFailedAt: '2026-06-19T12:00:00.000Z'
      };
    });
    repository.pruneStaleLoginAttemptStates.mockImplementationOnce(async () => {
      callOrder.push('prune');
    });

    await recordFailedLoginAttempt(
      repository as unknown as IdentityAccessRepository,
      'email:hash',
      new Date('2026-06-19T12:00:00.000Z')
    );

    expect(callOrder).toEqual(['record', 'prune']);
  });

  it('prunes at most once per process-local interval', async () => {
    const repository = makeRepository();

    await recordFailedLoginAttempt(
      repository as unknown as IdentityAccessRepository,
      'email:hash',
      new Date('2026-06-19T12:00:00.000Z')
    );
    await recordFailedLoginAttempt(
      repository as unknown as IdentityAccessRepository,
      'email:hash',
      new Date('2026-06-19T12:05:00.000Z')
    );
    await recordFailedLoginAttempt(
      repository as unknown as IdentityAccessRepository,
      'email:hash',
      new Date(new Date('2026-06-19T12:00:00.000Z').getTime() + loginAttemptPruneIntervalMs)
    );

    expect(repository.recordFailedLoginAttempt).toHaveBeenCalledTimes(3);
    expect(repository.pruneStaleLoginAttemptStates).toHaveBeenCalledTimes(2);
  });

  it('keeps the lockout response when best-effort prune fails', async () => {
    const repository = makeRepository();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository.recordFailedLoginAttempt.mockResolvedValueOnce({
      failedCount: loginFailureThreshold,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:04:00.000Z',
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });
    repository.pruneStaleLoginAttemptStates.mockRejectedValueOnce(new Error('prune down'));

    await expect(
      recordFailedLoginAttempt(
        repository as unknown as IdentityAccessRepository,
        'email:hash',
        new Date('2026-06-19T12:04:00.000Z')
      )
    ).rejects.toMatchObject({ status: 429, message: loginLockoutMessage });
    expect(repository.pruneStaleLoginAttemptStates).toHaveBeenCalledTimes(1);
  });
});
