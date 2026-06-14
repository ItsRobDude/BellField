import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getEntitlementArtifactPaths,
  readOptionalLicenseArtifactFile,
  writeLicenseArtifactAtomically
} from './license-artifact-cache';

describe('license artifact cache helpers', () => {
  it('does not derive artifact paths without a configured license path', () => {
    expect(getEntitlementArtifactPaths(undefined)).toBeNull();
    expect(getEntitlementArtifactPaths('   ')).toBeNull();
  });

  it('stores entitlement artifacts beside the configured license file', () => {
    const paths = getEntitlementArtifactPaths('C:/BellField/config/bellfield-license.json');

    expect(paths).toEqual({
      licenseDirectory: resolve('C:/BellField/config'),
      lastVerifiedLicensePath: join(resolve('C:/BellField/config'), 'bellfield-license-cache.json'),
      terminationReceiptsDirectory: join(resolve('C:/BellField/config'), 'entitlement-receipts')
    });
  });

  it('reads missing optional artifacts without throwing', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-license-cache-spec-'));
    try {
      expect(readOptionalLicenseArtifactFile(join(root, 'missing.json'))).toEqual({
        status: 'missing'
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('writes license artifacts through a replaceable temp file', () => {
    const root = mkdtempSync(join(tmpdir(), 'bellfield-license-cache-spec-'));
    try {
      const artifactPath = join(root, 'nested', 'bellfield-license-cache.json');

      writeLicenseArtifactAtomically(artifactPath, '{"license":"first"}');
      writeLicenseArtifactAtomically(artifactPath, '{"license":"second"}');

      expect(existsSync(artifactPath)).toBe(true);
      expect(readFileSync(artifactPath, 'utf8')).toBe('{"license":"second"}');
      expect(readOptionalLicenseArtifactFile(artifactPath)).toEqual({
        status: 'found',
        rawArtifact: '{"license":"second"}'
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
