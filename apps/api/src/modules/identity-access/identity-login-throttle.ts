import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { IdentityAccessRepository } from './identity-access.repository';
import {
  loginAttemptBlockedUntil,
  loginAttemptPruneCutoff,
  loginAttemptPruneIntervalMs,
  loginAttemptWindowCutoff,
  loginFailureThreshold,
  loginLockoutMessage
} from './login-attempt-policy';

const logger = new Logger('IdentityLoginThrottle');
let nextLoginAttemptPruneAtMs = 0;

export function resetLoginAttemptPruneCadenceForTests(): void {
  nextLoginAttemptPruneAtMs = 0;
}

export async function assertLoginRateLimit(
  identityAccessRepository: IdentityAccessRepository,
  bucketKey: string,
  now: Date
): Promise<void> {
  const state = await identityAccessRepository.findLoginAttemptState(bucketKey);
  if (state?.blockedUntil && new Date(state.blockedUntil).getTime() > now.getTime()) {
    throw new HttpException(loginLockoutMessage, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export async function recordFailedLoginAttempt(
  identityAccessRepository: IdentityAccessRepository,
  bucketKey: string,
  now: Date
): Promise<void> {
  const state = await identityAccessRepository.recordFailedLoginAttempt({
    bucketKey,
    occurredAt: now.toISOString(),
    windowCutoff: loginAttemptWindowCutoff(now),
    failureThreshold: loginFailureThreshold,
    blockedUntil: loginAttemptBlockedUntil(now)
  });
  await pruneStaleLoginAttemptsBestEffort(identityAccessRepository, now);

  if (state.blockedUntil && new Date(state.blockedUntil).getTime() > now.getTime()) {
    throw new HttpException(loginLockoutMessage, HttpStatus.TOO_MANY_REQUESTS);
  }
}

async function pruneStaleLoginAttemptsBestEffort(
  identityAccessRepository: IdentityAccessRepository,
  now: Date
): Promise<void> {
  const nowMs = now.getTime();
  if (nowMs < nextLoginAttemptPruneAtMs) {
    return;
  }

  nextLoginAttemptPruneAtMs = nowMs + loginAttemptPruneIntervalMs;
  try {
    await identityAccessRepository.pruneStaleLoginAttemptStates(loginAttemptPruneCutoff(now));
  } catch (error) {
    logger.warn(
      `Login attempt cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
