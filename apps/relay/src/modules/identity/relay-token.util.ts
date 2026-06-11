import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Token format pinned by docs/relay-token-design.md: bfrt1_<tokenId>_<secret>.
// Both segments are hex so the version prefix and separators stay unambiguous.
export const relayTokenPrefix = 'bfrt1';

const TOKEN_ID_PATTERN = /^[0-9a-f]{16}$/;
const TOKEN_SECRET_PATTERN = /^[0-9a-f]{64}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export type GeneratedRelayToken = {
  /** Full plaintext token. Exists exactly once, in issuance output. */
  token: string;
  tokenId: string;
  /** SHA-256 hex of the full token string — the only form stored. */
  tokenHash: string;
};

export function generateRelayToken(): GeneratedRelayToken {
  const tokenId = randomBytes(8).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const token = `${relayTokenPrefix}_${tokenId}_${secret}`;
  return { token, tokenId, tokenHash: hashRelayToken(token) };
}

export function hashRelayToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function parseRelayToken(value: string): { tokenId: string } | null {
  const parts = value.split('_');
  if (parts.length !== 3) {
    return null;
  }
  const [prefix, tokenId, secret] = parts;
  if (prefix !== relayTokenPrefix) {
    return null;
  }
  if (!TOKEN_ID_PATTERN.test(tokenId) || !TOKEN_SECRET_PATTERN.test(secret)) {
    return null;
  }
  return { tokenId };
}

export function relayTokenHashMatches(token: string, storedHash: string): boolean {
  if (!TOKEN_HASH_PATTERN.test(storedHash)) {
    return false;
  }
  const candidate = Buffer.from(hashRelayToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
