import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { IdentityAccessRepository } from './identity-access.repository';
import {
  identityAttemptBlockedUntil,
  identityAttemptPruneCutoff,
  identityAttemptPruneIntervalMs,
  identityAttemptWindowCutoff,
  type IdentityAttemptThrottlePolicy
} from './login-attempt-policy';

const logger = new Logger('IdentityAttemptThrottle');
let nextIdentityAttemptPruneAtMs = 0;

export function resetIdentityAttemptPruneCadenceForTests(): void {
  nextIdentityAttemptPruneAtMs = 0;
}

export async function assertIdentityAttemptRateLimit(
  identityAccessRepository: IdentityAccessRepository,
  policy: IdentityAttemptThrottlePolicy,
  now: Date
): Promise<void> {
  const state = await identityAccessRepository.findIdentityAttemptState(policy.bucketKey);
  if (state?.blockedUntil && new Date(state.blockedUntil).getTime() > now.getTime()) {
    throw new HttpException(policy.lockoutMessage, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export async function recordFailedIdentityAttempt(
  identityAccessRepository: IdentityAccessRepository,
  policy: IdentityAttemptThrottlePolicy,
  now: Date
): Promise<void> {
  const state = await identityAccessRepository.recordFailedIdentityAttempt({
    bucketKey: policy.bucketKey,
    occurredAt: now.toISOString(),
    windowCutoff: identityAttemptWindowCutoff(policy, now),
    failureThreshold: policy.failureThreshold,
    blockedUntil: identityAttemptBlockedUntil(policy, now)
  });
  await pruneStaleIdentityAttemptsBestEffort(identityAccessRepository, now);

  if (
    policy.lockOnThresholdAttempt &&
    state.blockedUntil &&
    new Date(state.blockedUntil).getTime() > now.getTime()
  ) {
    throw new HttpException(policy.lockoutMessage, HttpStatus.TOO_MANY_REQUESTS);
  }
}

async function pruneStaleIdentityAttemptsBestEffort(
  identityAccessRepository: IdentityAccessRepository,
  now: Date
): Promise<void> {
  const nowMs = now.getTime();
  if (nowMs < nextIdentityAttemptPruneAtMs) {
    return;
  }

  nextIdentityAttemptPruneAtMs = nowMs + identityAttemptPruneIntervalMs;
  try {
    await identityAccessRepository.pruneStaleIdentityAttemptStates(identityAttemptPruneCutoff(now));
  } catch (error) {
    logger.warn(
      `Identity attempt cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
