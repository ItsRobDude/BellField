import {
  generateAcceptanceToken,
  hashAcceptanceToken,
  isWellFormedAcceptanceToken
} from './acceptance-token.util';

describe('acceptance token util', () => {
  it('generates 40-char hex tokens whose stored form is the SHA-256 hash', () => {
    const generated = generateAcceptanceToken();
    expect(generated.token).toMatch(/^[0-9a-f]{40}$/);
    expect(generated.tokenHash).toBe(hashAcceptanceToken(generated.token));
    expect(generated.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.tokenHash).not.toBe(generated.token);
  });

  it('generates unique tokens', () => {
    expect(generateAcceptanceToken().token).not.toBe(generateAcceptanceToken().token);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(isWellFormedAcceptanceToken('f'.repeat(40))).toBe(true);
    expect(isWellFormedAcceptanceToken('f'.repeat(39))).toBe(false);
    expect(isWellFormedAcceptanceToken('f'.repeat(41))).toBe(false);
    expect(isWellFormedAcceptanceToken('F'.repeat(40))).toBe(false);
    expect(isWellFormedAcceptanceToken('')).toBe(false);
    expect(isWellFormedAcceptanceToken("' OR 1=1 --")).toBe(false);
  });
});
