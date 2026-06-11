import {
  generateRelayToken,
  hashRelayToken,
  parseRelayToken,
  relayTokenHashMatches,
  relayTokenPrefix
} from './relay-token.util';

describe('relay token utilities', () => {
  it('generates tokens in the pinned bfrt1 format', () => {
    const generated = generateRelayToken();
    expect(generated.token).toMatch(/^bfrt1_[0-9a-f]{16}_[0-9a-f]{64}$/);
    expect(generated.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.token).toContain(`${relayTokenPrefix}_${generated.tokenId}_`);
  });

  it('generates unique tokens per call', () => {
    const first = generateRelayToken();
    const second = generateRelayToken();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenId).not.toBe(second.tokenId);
  });

  it('parses a generated token back to its token id', () => {
    const generated = generateRelayToken();
    expect(parseRelayToken(generated.token)).toEqual({ tokenId: generated.tokenId });
  });

  it.each([
    ['empty string', ''],
    ['wrong prefix', 'bfrt2_0123456789abcdef_' + 'a'.repeat(64)],
    ['missing segments', 'bfrt1_0123456789abcdef'],
    ['extra segments', 'bfrt1_0123456789abcdef_' + 'a'.repeat(64) + '_extra'],
    ['short token id', 'bfrt1_0123_' + 'a'.repeat(64)],
    ['non-hex secret', 'bfrt1_0123456789abcdef_' + 'z'.repeat(64)],
    ['short secret', 'bfrt1_0123456789abcdef_' + 'a'.repeat(32)]
  ])('rejects malformed token: %s', (_label, value) => {
    expect(parseRelayToken(value)).toBeNull();
  });

  it('matches a token against its stored hash', () => {
    const generated = generateRelayToken();
    expect(relayTokenHashMatches(generated.token, generated.tokenHash)).toBe(true);
  });

  it('rejects a different token against a stored hash', () => {
    const generated = generateRelayToken();
    const other = generateRelayToken();
    expect(relayTokenHashMatches(other.token, generated.tokenHash)).toBe(false);
  });

  it('rejects malformed stored hashes without throwing', () => {
    const generated = generateRelayToken();
    expect(relayTokenHashMatches(generated.token, 'not-a-hash')).toBe(false);
    expect(relayTokenHashMatches(generated.token, '')).toBe(false);
  });

  it('hashes deterministically', () => {
    const generated = generateRelayToken();
    expect(hashRelayToken(generated.token)).toBe(generated.tokenHash);
  });
});
