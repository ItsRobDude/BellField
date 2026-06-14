import { generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEntitlementArtifactPaths } from './license-artifact-cache';
import { resolveInstalledLicenseEntitlement } from './license-entitlement-store';
import {
  canonicalizeLicenseBody,
  licenseKeyId,
  licenseSignatureAlgorithm,
  type BellFieldLicenseBody
} from './license-verification';

const now = new Date('2026-06-13T12:00:00.000Z');

function createSigner() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  return {
    publicKeyPem,
    signLicense(license: BellFieldLicenseBody): string {
      const signature = sign(
        null,
        Buffer.from(canonicalizeLicenseBody(license), 'utf8'),
        privateKey
      );
      return `${JSON.stringify(
        {
          license,
          signature: {
            algorithm: licenseSignatureAlgorithm,
            keyId: licenseKeyId,
            value: signature.toString('base64url')
          }
        },
        null,
        2
      )}\n`;
    }
  };
}

function paidLicense(licenseId = 'lic_paid_001'): BellFieldLicenseBody {
  return {
    schemaVersion: 2,
    licenseKind: 'paid',
    licenseId,
    shopName: 'Paid Shop',
    issuedAt: '2026-06-01T00:00:00.000Z',
    updateWindowEnd: '2027-06-01'
  };
}

function dataOnlyLicense(terminatedLicenseId = 'lic_paid_001'): BellFieldLicenseBody {
  return {
    schemaVersion: 2,
    licenseKind: 'dataOnly',
    licenseId: 'lic_data_only_001',
    terminatedLicenseId,
    shopName: 'Refunded Shop',
    issuedAt: '2026-06-13T00:00:00.000Z',
    terminationReason: 'refund'
  };
}

describe('resolveInstalledLicenseEntitlement', () => {
  it('writes a valid current license to the signed artifact cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-entitlement-store-spec-'));
    try {
      const signer = createSigner();
      const licensePath = join(root, 'bellfield-license.json');
      const rawLicense = signer.signLicense(paidLicense());
      writeFileSync(licensePath, rawLicense, 'utf8');

      const result = resolveInstalledLicenseEntitlement({
        licensePath,
        publicKeyPem: signer.publicKeyPem,
        now
      });
      const paths = getEntitlementArtifactPaths(licensePath);

      expect(result.cacheWriteError).toBeUndefined();
      expect(result.entitlement.state).toBe('paidOperational');
      expect(paths && existsSync(paths.lastVerifiedLicensePath)).toBe(true);
      expect(paths && readFileSync(paths.lastVerifiedLicensePath, 'utf8')).toBe(rawLicense);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('falls open to the last verified signed paid cache when the current file is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-entitlement-store-spec-'));
    try {
      const signer = createSigner();
      const licensePath = join(root, 'bellfield-license.json');
      const paths = getEntitlementArtifactPaths(licensePath);
      if (!paths) {
        throw new Error('expected entitlement paths');
      }
      writeFileSync(paths.lastVerifiedLicensePath, signer.signLicense(paidLicense()), 'utf8');

      const result = resolveInstalledLicenseEntitlement({
        licensePath,
        publicKeyPem: signer.publicKeyPem,
        now
      });

      expect(result.current.status).toBe('missing');
      expect(result.cachedLicense?.status).toBe('valid');
      expect(result.entitlement).toMatchObject({
        state: 'paidOperational',
        source: 'cache'
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('ignores plaintext cache state because it is not a signed artifact', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-entitlement-store-spec-'));
    try {
      const signer = createSigner();
      const licensePath = join(root, 'bellfield-license.json');
      const paths = getEntitlementArtifactPaths(licensePath);
      if (!paths) {
        throw new Error('expected entitlement paths');
      }
      writeFileSync(paths.lastVerifiedLicensePath, '{"state":"paid"}', 'utf8');

      const result = resolveInstalledLicenseEntitlement({
        licensePath,
        publicKeyPem: signer.publicKeyPem,
        now
      });

      expect(result.cachedLicense?.status).toBe('invalid');
      expect(result.entitlement).toMatchObject({
        state: 'licenseRecovery',
        reason: 'missing'
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('lets a signed data-only receipt supersede a matching current paid license', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-entitlement-store-spec-'));
    try {
      const signer = createSigner();
      const licensePath = join(root, 'bellfield-license.json');
      const paths = getEntitlementArtifactPaths(licensePath);
      if (!paths) {
        throw new Error('expected entitlement paths');
      }
      writeFileSync(licensePath, signer.signLicense(paidLicense('lic_paid_001')), 'utf8');
      mkdirSync(paths.terminationReceiptsDirectory, { recursive: true });
      writeFileSync(
        join(paths.terminationReceiptsDirectory, 'receipt.json'),
        signer.signLicense(dataOnlyLicense('lic_paid_001')),
        'utf8'
      );

      const result = resolveInstalledLicenseEntitlement({
        licensePath,
        publicKeyPem: signer.publicKeyPem,
        now
      });

      expect(result.terminationReceipts).toHaveLength(1);
      expect(result.entitlement).toMatchObject({
        state: 'refundedDataOnly',
        source: 'terminationReceipt'
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
