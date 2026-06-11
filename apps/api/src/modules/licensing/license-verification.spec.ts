import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertRuntimeLicense,
  canonicalizeLicenseBody,
  licenseKeyId,
  licenseSignatureAlgorithm,
  verifyLicenseContent,
  verifyLicenseFile,
  type BellFieldLicenseBody
} from './license-verification';

function createSignedLicense(overrides: Partial<BellFieldLicenseBody> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const license: BellFieldLicenseBody = {
    schemaVersion: 1,
    licenseId: 'lic_test_001',
    shopName: 'Test Service Co.',
    issuedAt: '2026-06-11T00:00:00.000Z',
    updateWindowEnd: '2027-06-11',
    ...overrides
  };
  const signature = sign(null, Buffer.from(canonicalizeLicenseBody(license), 'utf8'), privateKey);

  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    envelope: {
      license,
      signature: {
        algorithm: licenseSignatureAlgorithm,
        keyId: licenseKeyId,
        value: signature.toString('base64url')
      }
    }
  };
}

describe('license verification', () => {
  it('verifies a valid signed license', () => {
    const { envelope, publicKeyPem } = createSignedLicense();

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status).toEqual({
      status: 'valid',
      license: {
        ...envelope.license,
        keyId: licenseKeyId
      }
    });
  });

  it('rejects a missing license file', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-license-spec-'));
    try {
      const status = verifyLicenseFile({ licensePath: join(root, 'missing-license.json') });
      expect(status.status).toBe('missing');
      if (status.status === 'valid') {
        throw new Error('expected missing license status');
      }
      expect(status.message).toMatch(/not found/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects a tampered license body', () => {
    const { envelope, publicKeyPem } = createSignedLicense();
    const tampered = {
      ...envelope,
      license: {
        ...envelope.license,
        shopName: 'Different Shop'
      }
    };

    const status = verifyLicenseContent(JSON.stringify(tampered), publicKeyPem);

    expect(status).toEqual({
      status: 'invalid',
      message: 'License signature did not verify.'
    });
  });

  it('accepts an expired update window because runtime is perpetual', () => {
    const { envelope, publicKeyPem } = createSignedLicense({ updateWindowEnd: '2020-01-01' });

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status.status).toBe('valid');
  });

  it('accepts a future issuedAt timestamp because runtime is offline and clock-skew tolerant', () => {
    const { envelope, publicKeyPem } = createSignedLicense({
      issuedAt: '2030-01-01T00:00:00.000Z'
    });

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status.status).toBe('valid');
  });

  it('throws a readable startup error when a required license is missing', () => {
    expect(() =>
      assertRuntimeLicense({
        licenseRequired: true,
        licensePath: undefined
      })
    ).toThrow(/valid license file is required/);
  });

  it('does not require a license when the runtime flag is off', () => {
    expect(() =>
      assertRuntimeLicense({
        licenseRequired: false,
        licensePath: undefined
      })
    ).not.toThrow();
  });

  it('verifies a required license from disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-license-spec-'));
    try {
      const { envelope, publicKeyPem } = createSignedLicense();
      const path = join(root, 'bellfield-license.json');
      writeFileSync(path, JSON.stringify(envelope), 'utf8');

      const status = verifyLicenseFile({ licensePath: path, publicKeyPem });

      expect(status.status).toBe('valid');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
