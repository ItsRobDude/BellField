import { hashPassword, isHashed, verifyPassword } from './password-hash';

describe('password-hash', () => {
  it('hashes into the scrypt$salt$hash format with a unique salt', async () => {
    const a = await hashPassword('hunter2');
    const b = await hashPassword('hunter2');
    expect(a).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(isHashed(a)).toBe(true);
    expect(a).not.toBe(b); // salted → different ciphertext for the same input
  });

  it('verifies a correct hashed password (no rehash needed)', async () => {
    const stored = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', stored)).toEqual({ ok: true, needsRehash: false });
  });

  it('rejects a wrong password against a hash', async () => {
    const stored = await hashPassword('hunter2');
    expect(await verifyPassword('wrong', stored)).toEqual({ ok: false, needsRehash: false });
  });

  it('accepts a matching legacy plaintext password and flags a rehash', async () => {
    expect(await verifyPassword('bellfield-owner', 'bellfield-owner')).toEqual({
      ok: true,
      needsRehash: true
    });
  });

  it('rejects a non-matching legacy plaintext password without flagging a rehash', async () => {
    expect(await verifyPassword('wrong', 'bellfield-owner')).toEqual({
      ok: false,
      needsRehash: false
    });
  });

  it('rejects a malformed hash without throwing', async () => {
    expect(await verifyPassword('x', 'scrypt$onlyonepart')).toEqual({
      ok: false,
      needsRehash: false
    });
  });
});
