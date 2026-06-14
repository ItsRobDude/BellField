import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertRuntimeLicense,
  canonicalizeLicenseBody,
  licenseKeyId,
  licenseSignatureAlgorithm,
  verifyLicenseContent,
  verifyLicenseFile,
  type BellFieldLegacyLicenseBody,
  type BellFieldLicenseBody
} from './license-verification';

function createLegacyLicense(
  overrides: Partial<BellFieldLegacyLicenseBody> = {}
): BellFieldLegacyLicenseBody {
  return {
    schemaVersion: 1,
    licenseId: 'lic_test_001',
    shopName: 'Test Service Co.',
    issuedAt: '2026-06-11T00:00:00.000Z',
    updateWindowEnd: '2027-06-11',
    ...overrides
  };
}

function createSignedLicense(license: BellFieldLicenseBody = createLegacyLicense()) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
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

function repoRoot(): string {
  let candidate = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(candidate, 'tools', 'update', 'license-verification.mjs'))) {
      return candidate;
    }
    candidate = join(candidate, '..');
  }
  throw new Error('Could not find repo root for tooling verifier parity test.');
}

function verifyWithStandaloneTooling(rawLicenseFile: string, publicKeyPem: string): unknown {
  const script = [
    "import { verifyLicenseContent } from './tools/update/license-verification.mjs';",
    "const raw = Buffer.from(process.env.RAW_LICENSE_B64 ?? '', 'base64').toString('utf8');",
    'console.log(JSON.stringify(verifyLicenseContent(raw, process.env.PUBLIC_KEY_PEM)));'
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: repoRoot(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RAW_LICENSE_B64: Buffer.from(rawLicenseFile, 'utf8').toString('base64'),
      PUBLIC_KEY_PEM: publicKeyPem
    },
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `tooling verifier exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
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

  it('rejects unsigned fields added to the signed license object', () => {
    const { envelope, publicKeyPem } = createSignedLicense();
    const tampered = {
      ...envelope,
      license: {
        ...envelope.license,
        licenseKind: 'paid'
      }
    };

    const status = verifyLicenseContent(JSON.stringify(tampered), publicKeyPem);

    expect(status).toEqual({
      status: 'invalid',
      message: 'License signature did not verify.'
    });
  });

  it('accepts an expired update window because runtime is perpetual', () => {
    const { envelope, publicKeyPem } = createSignedLicense(
      createLegacyLicense({ updateWindowEnd: '2020-01-01' })
    );

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status.status).toBe('valid');
  });

  it('accepts a future issuedAt timestamp because runtime is offline and clock-skew tolerant', () => {
    const { envelope, publicKeyPem } = createSignedLicense(
      createLegacyLicense({
        issuedAt: '2030-01-01T00:00:00.000Z'
      })
    );

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

  it('verifies a v2 paid license', () => {
    const { envelope, publicKeyPem } = createSignedLicense({
      schemaVersion: 2,
      licenseKind: 'paid',
      licenseId: 'lic_paid_001',
      shopName: 'Paid Shop',
      issuedAt: '2026-06-11T00:00:00.000Z',
      updateWindowEnd: '2027-06-11'
    });

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status).toEqual({
      status: 'valid',
      license: {
        ...envelope.license,
        keyId: licenseKeyId
      }
    });
  });

  it('verifies a v2 trial license', () => {
    const { envelope, publicKeyPem } = createSignedLicense({
      schemaVersion: 2,
      licenseKind: 'trial',
      licenseId: 'lic_trial_001',
      shopName: 'Trial Shop',
      issuedAt: '2026-06-11T00:00:00.000Z',
      updateWindowEnd: '2026-07-11',
      operationEnd: '2026-07-11'
    });

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status).toEqual({
      status: 'valid',
      license: {
        ...envelope.license,
        keyId: licenseKeyId
      }
    });
  });

  it('verifies a v2 data-only license', () => {
    const { envelope, publicKeyPem } = createSignedLicense({
      schemaVersion: 2,
      licenseKind: 'dataOnly',
      licenseId: 'lic_data_only_001',
      terminatedLicenseId: 'lic_paid_001',
      shopName: 'Refunded Shop',
      issuedAt: '2026-06-11T00:00:00.000Z',
      terminationReason: 'refund'
    });

    const status = verifyLicenseContent(JSON.stringify(envelope), publicKeyPem);

    expect(status).toEqual({
      status: 'valid',
      license: {
        ...envelope.license,
        keyId: licenseKeyId
      }
    });
  });

  it('rejects v2 trials without operationEnd', () => {
    const { envelope, publicKeyPem } = createSignedLicense({
      schemaVersion: 2,
      licenseKind: 'trial',
      licenseId: 'lic_trial_001',
      shopName: 'Trial Shop',
      issuedAt: '2026-06-11T00:00:00.000Z',
      updateWindowEnd: '2026-07-11',
      operationEnd: '2026-07-11'
    });
    const malformed = {
      ...envelope,
      license: {
        schemaVersion: 2,
        licenseKind: 'trial',
        licenseId: 'lic_trial_001',
        shopName: 'Trial Shop',
        issuedAt: '2026-06-11T00:00:00.000Z',
        updateWindowEnd: '2026-07-11'
      }
    };

    const status = verifyLicenseContent(JSON.stringify(malformed), publicKeyPem);

    expect(status).toEqual({
      status: 'invalid',
      message: 'License operationEnd must be a non-empty string.'
    });
  });

  it('keeps the API and standalone tooling verifier verdicts in parity', () => {
    const validFixtures = [
      createSignedLicense(createLegacyLicense()),
      createSignedLicense({
        schemaVersion: 2,
        licenseKind: 'paid',
        licenseId: 'lic_paid_001',
        shopName: 'Paid Shop',
        issuedAt: '2026-06-11T00:00:00.000Z',
        updateWindowEnd: '2027-06-11'
      }),
      createSignedLicense({
        schemaVersion: 2,
        licenseKind: 'trial',
        licenseId: 'lic_trial_001',
        shopName: 'Trial Shop',
        issuedAt: '2026-06-11T00:00:00.000Z',
        updateWindowEnd: '2026-07-11',
        operationEnd: '2026-07-11'
      }),
      createSignedLicense({
        schemaVersion: 2,
        licenseKind: 'trial',
        licenseId: 'lic_expired_trial_001',
        shopName: 'Expired Trial Shop',
        issuedAt: '2026-05-01T00:00:00.000Z',
        updateWindowEnd: '2026-05-31',
        operationEnd: '2026-05-31'
      }),
      createSignedLicense({
        schemaVersion: 2,
        licenseKind: 'dataOnly',
        licenseId: 'lic_data_only_001',
        terminatedLicenseId: 'lic_paid_001',
        shopName: 'Refunded Shop',
        issuedAt: '2026-06-11T00:00:00.000Z',
        terminationReason: 'refund'
      })
    ];
    const tampered = createSignedLicense(createLegacyLicense());
    const parityCases = [
      ...validFixtures.map((fixture) => ({
        rawLicense: JSON.stringify(fixture.envelope),
        publicKeyPem: fixture.publicKeyPem
      })),
      {
        rawLicense: JSON.stringify({
          ...tampered.envelope,
          license: {
            ...tampered.envelope.license,
            shopName: 'Tampered Shop'
          }
        }),
        publicKeyPem: tampered.publicKeyPem
      }
    ];

    for (const { rawLicense, publicKeyPem } of parityCases) {
      const apiStatus = verifyLicenseContent(rawLicense, publicKeyPem);
      const toolingStatus = verifyWithStandaloneTooling(rawLicense, publicKeyPem);

      expect(toolingStatus).toEqual(apiStatus);
    }
  });
});
