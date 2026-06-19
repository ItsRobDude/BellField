import { createHash } from 'node:crypto';

export const loginFailureThreshold = 5;
export const loginFailureWindowMs = 15 * 60 * 1000;
export const loginLockoutMs = 5 * 60 * 1000;
export const loginAttemptPruneAgeMs = 24 * 60 * 60 * 1000;
export const loginAttemptPruneIntervalMs = 10 * 60 * 1000;
export const loginLockoutMessage = 'Too many sign-in attempts. Try again in 5 minutes.';

export const dummyLoginPasswordHash =
  'scrypt$0123456789abcdef0123456789abcdef$2857021782dcf3163c0d368f2fe25e409303c1f7e029ee326a880f49801d219ed9d97e6072ed08832546d76dfd4a2f6c78fe950fb3ea48422f9744d31f37994c';

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function loginAttemptBucketKey(normalizedEmail: string): string {
  const digest = createHash('sha256').update(normalizedEmail, 'utf8').digest('hex');
  return `email:${digest}`;
}

export function loginAttemptWindowCutoff(now: Date): string {
  return new Date(now.getTime() - loginFailureWindowMs).toISOString();
}

export function loginAttemptBlockedUntil(now: Date): string {
  return new Date(now.getTime() + loginLockoutMs).toISOString();
}

export function loginAttemptPruneCutoff(now: Date): string {
  return new Date(now.getTime() - loginAttemptPruneAgeMs).toISOString();
}
