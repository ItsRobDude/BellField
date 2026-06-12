import { createHash, randomBytes } from 'node:crypto';

// Acceptance-link tokens are opaque 40-char hex (randomBytes(20)) per
// docs/acceptance-links-design.md. Only the SHA-256 hash is stored; a relay
// database leak must not yield live links.

const ACCEPTANCE_TOKEN_PATTERN = /^[0-9a-f]{40}$/;

export type GeneratedAcceptanceToken = {
  /** Full plaintext token. Exists only in the sent email and the minting response. */
  token: string;
  /** SHA-256 hex of the token — the only form stored. */
  tokenHash: string;
};

export function generateAcceptanceToken(): GeneratedAcceptanceToken {
  const token = randomBytes(20).toString('hex');
  return { token, tokenHash: hashAcceptanceToken(token) };
}

export function hashAcceptanceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Shape check before hashing so malformed paths never reach the database.
 * Lookup is by hash, so no timing-safe comparison is needed here.
 */
export function isWellFormedAcceptanceToken(value: string): boolean {
  return ACCEPTANCE_TOKEN_PATTERN.test(value);
}
