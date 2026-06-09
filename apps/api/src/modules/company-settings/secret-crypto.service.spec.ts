import { SecretCryptoService } from './secret-crypto.service';

const originalNodeEnv = process.env.NODE_ENV;
const originalSecretsKey = process.env.BELLFIELD_SECRETS_KEY;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalSecretsKey === undefined) {
    delete process.env.BELLFIELD_SECRETS_KEY;
  } else {
    process.env.BELLFIELD_SECRETS_KEY = originalSecretsKey;
  }
});

describe('SecretCryptoService', () => {
  it('encrypts secrets without returning the plaintext', () => {
    process.env.NODE_ENV = 'test';
    process.env.BELLFIELD_SECRETS_KEY = 'a'.repeat(64);
    const service = new SecretCryptoService();

    const encrypted = service.encryptSecret('resend-secret-value');

    expect(encrypted.encryptedValue).not.toContain('resend-secret-value');
    expect(service.decryptSecret(encrypted)).toBe('resend-secret-value');
  });

  it('requires an explicit production key', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BELLFIELD_SECRETS_KEY;
    const service = new SecretCryptoService();

    expect(() => service.onModuleInit()).toThrow(/BELLFIELD_SECRETS_KEY is required/);
  });

  it('rejects weak configured keys', () => {
    process.env.NODE_ENV = 'test';
    process.env.BELLFIELD_SECRETS_KEY = 'too-short';
    const service = new SecretCryptoService();

    expect(() => service.onModuleInit()).toThrow(/at least 32 characters/);
  });
});
