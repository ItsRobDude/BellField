import { createHash } from 'node:crypto';

export type IdentityAttemptThrottlePolicy = {
  bucketKey: string;
  failureThreshold: number;
  failureWindowMs: number;
  lockoutMs: number;
  lockoutMessage: string;
  lockOnThresholdAttempt: boolean;
};

export const loginFailureThreshold = 5;
export const loginFailureWindowMs = 15 * 60 * 1000;
export const loginLockoutMs = 5 * 60 * 1000;
export const identityAttemptPruneAgeMs = 24 * 60 * 60 * 1000;
export const identityAttemptPruneIntervalMs = 10 * 60 * 1000;
export const loginLockoutMessage = 'Too many sign-in attempts. Try again in 5 minutes.';

export const firstOwnerSetupAttemptBucketKey = 'setup:first-owner';
export const firstOwnerSetupFailureThreshold = 5;
export const firstOwnerSetupFailureWindowMs = 10 * 60 * 1000;
export const firstOwnerSetupLockoutMs = 5 * 60 * 1000;
export const firstOwnerSetupLockoutMessage = 'Too many invalid setup attempts. Try again shortly.';

export const dummyLoginPasswordHash =
  'scrypt$0123456789abcdef0123456789abcdef$2857021782dcf3163c0d368f2fe25e409303c1f7e029ee326a880f49801d219ed9d97e6072ed08832546d76dfd4a2f6c78fe950fb3ea48422f9744d31f37994c';

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function loginAttemptBucketKey(normalizedEmail: string): string {
  const digest = createHash('sha256').update(normalizedEmail, 'utf8').digest('hex');
  return `email:${digest}`;
}

export function loginAttemptThrottlePolicy(normalizedEmail: string): IdentityAttemptThrottlePolicy {
  return {
    bucketKey: loginAttemptBucketKey(normalizedEmail),
    failureThreshold: loginFailureThreshold,
    failureWindowMs: loginFailureWindowMs,
    lockoutMs: loginLockoutMs,
    lockoutMessage: loginLockoutMessage,
    lockOnThresholdAttempt: true
  };
}

export function firstOwnerSetupAttemptThrottlePolicy(): IdentityAttemptThrottlePolicy {
  return {
    bucketKey: firstOwnerSetupAttemptBucketKey,
    failureThreshold: firstOwnerSetupFailureThreshold,
    failureWindowMs: firstOwnerSetupFailureWindowMs,
    lockoutMs: firstOwnerSetupLockoutMs,
    lockoutMessage: firstOwnerSetupLockoutMessage,
    lockOnThresholdAttempt: false
  };
}

export function identityAttemptWindowCutoff(
  policy: IdentityAttemptThrottlePolicy,
  now: Date
): string {
  return new Date(now.getTime() - policy.failureWindowMs).toISOString();
}

export function identityAttemptBlockedUntil(
  policy: IdentityAttemptThrottlePolicy,
  now: Date
): string {
  return new Date(now.getTime() + policy.lockoutMs).toISOString();
}

export function identityAttemptPruneCutoff(now: Date): string {
  return new Date(now.getTime() - identityAttemptPruneAgeMs).toISOString();
}
