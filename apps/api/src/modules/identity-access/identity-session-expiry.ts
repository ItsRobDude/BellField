import { UnauthorizedException } from '@nestjs/common';
import type { ApiSessionTtlConfig } from '../../common/config/runtime-config';
import type { LoginSurface, SessionRecord } from './identity-access.types';

export const sessionExpiredCode = 'sessionExpired';
export const sessionExpiredMessage = 'Session expired. Please sign in again.';
export const sessionPruneIntervalMs = 10 * 60 * 1000;

const sessionPruneGraceMs = 30 * 24 * 60 * 60 * 1000;

type SessionExpiryInput = Pick<SessionRecord, 'surface' | 'issuedAt'>;

export function buildSessionExpiredException(): UnauthorizedException {
  return new UnauthorizedException({
    message: sessionExpiredMessage,
    code: sessionExpiredCode
  });
}

export function isIdentitySessionExpired(
  session: SessionExpiryInput,
  sessionTtl: ApiSessionTtlConfig,
  now: Date
): boolean {
  const issuedAtMs = Date.parse(session.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return true;
  }

  return now.getTime() - issuedAtMs >= sessionTtlMsForSurface(session.surface, sessionTtl);
}

export function getStaleSessionPruneCutoff(now: Date, sessionTtl: ApiSessionTtlConfig): string {
  const cutoffMs =
    now.getTime() -
    Math.max(sessionTtl.officeWebMs, sessionTtl.fieldMobileMs) -
    sessionPruneGraceMs;
  return new Date(cutoffMs).toISOString();
}

function sessionTtlMsForSurface(surface: LoginSurface, sessionTtl: ApiSessionTtlConfig): number {
  return surface === 'field-mobile' ? sessionTtl.fieldMobileMs : sessionTtl.officeWebMs;
}
