import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Password hashing with Node's built-in scrypt (no new dependency). Stored format:
//   scrypt$<salt-hex>$<derived-key-hex>
// Legacy rows hold the plaintext password directly; verifyPassword accepts them and signals a rehash
// so the fleet migrates organically on the next successful login (see identity-access login).

const scryptAsync = promisify(scrypt);
const PREFIX = 'scrypt';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Hash a plaintext password into the `scrypt$salt$hash` storage format. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `${PREFIX}$${salt}$${derived.toString('hex')}`;
}

/** True when a stored value is already in the scrypt hash format (vs a legacy plaintext password). */
export function isHashed(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`);
}

export type VerifyResult = {
  /** Whether the password matches. */
  ok: boolean;
  /** True when a matching password is still stored as legacy plaintext and should be rehashed. */
  needsRehash: boolean;
};

/** Verify a plaintext password against a stored value (hashed or legacy plaintext). Never throws. */
export async function verifyPassword(plain: string, stored: string): Promise<VerifyResult> {
  if (isHashed(stored)) {
    const parts = stored.split('$');
    const salt = parts[1];
    const hashHex = parts[2];
    if (!salt || !hashHex) {
      return { ok: false, needsRehash: false };
    }
    const expected = Buffer.from(hashHex, 'hex');
    const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
    const ok = expected.length === derived.length && timingSafeEqual(expected, derived);
    return { ok, needsRehash: false };
  }

  // Legacy plaintext: constant-time-ish compare, and flag a rehash when it matches.
  const ok = stored === plain;
  return { ok, needsRehash: ok };
}
