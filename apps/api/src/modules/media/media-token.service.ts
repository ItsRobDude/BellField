import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MediaConfigService } from './media-config.service';
import type { MediaSignedTokenScope } from '@bellfield/contracts';

/**
 * Compact HMAC-signed tokens for the media upload/download endpoints.
 *
 * Shape (each field encoded as base64url and joined by '.'):
 *
 *   <payloadJson>.<signature>
 *
 * Where the payload is `{ mediaId, scope, exp }` and `exp` is a unix
 * millisecond expiry. The signature is HMAC-SHA256 over the payload
 * bytes using the configured secret.
 *
 * Tokens are short-lived (default 5 minutes). Verification rejects
 * expired tokens and any signature mismatch using a constant-time
 * comparison.
 */
@Injectable()
export class MediaTokenService {
  constructor(private readonly mediaConfig: MediaConfigService) {}

  signToken(mediaId: string, scope: MediaSignedTokenScope, now: Date = new Date()): { token: string; expiresAt: string } {
    const expiresAtMs = now.getTime() + this.mediaConfig.getTokenTtlSeconds() * 1000;
    const payload = { mediaId, scope, exp: expiresAtMs };
    const payloadEncoded = encodeBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = this.computeSignature(payloadEncoded);
    return {
      token: `${payloadEncoded}.${signature}`,
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  }

  /**
   * Returns the verified payload or null when the token is malformed,
   * tampered with, scope-mismatched, or expired.
   */
  verifyToken(
    token: string,
    expectedMediaId: string,
    expectedScope: MediaSignedTokenScope,
    now: Date = new Date()
  ): { mediaId: string; scope: MediaSignedTokenScope; exp: number } | null {
    if (!token || typeof token !== 'string') {
      return null;
    }
    const dotIndex = token.indexOf('.');
    if (dotIndex <= 0 || dotIndex === token.length - 1) {
      return null;
    }
    const payloadEncoded = token.slice(0, dotIndex);
    const providedSignature = token.slice(dotIndex + 1);
    const expectedSignature = this.computeSignature(payloadEncoded);
    if (!safeEqual(providedSignature, expectedSignature)) {
      return null;
    }

    let payload: { mediaId?: unknown; scope?: unknown; exp?: unknown };
    try {
      payload = JSON.parse(decodeBase64Url(payloadEncoded).toString('utf8')) as {
        mediaId?: unknown;
        scope?: unknown;
        exp?: unknown;
      };
    } catch {
      return null;
    }

    if (typeof payload.mediaId !== 'string' || payload.mediaId !== expectedMediaId) {
      return null;
    }
    if (typeof payload.scope !== 'string' || payload.scope !== expectedScope) {
      return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp <= now.getTime()) {
      return null;
    }

    return { mediaId: payload.mediaId, scope: expectedScope, exp: payload.exp };
  }

  private computeSignature(payloadEncoded: string): string {
    const hmac = createHmac('sha256', this.mediaConfig.getTokenSecret());
    hmac.update(payloadEncoded);
    return encodeBase64Url(hmac.digest());
  }
}

function encodeBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(encoded: string): Buffer {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}
