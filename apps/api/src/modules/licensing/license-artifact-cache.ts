import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export type EntitlementArtifactPaths = {
  licenseDirectory: string;
  lastVerifiedLicensePath: string;
  terminationReceiptsDirectory: string;
};

export type OptionalLicenseArtifactRead =
  | { status: 'found'; rawArtifact: string }
  | { status: 'missing' }
  | { status: 'unreadable'; message: string };

export function getEntitlementArtifactPaths(
  licensePath: string | undefined
): EntitlementArtifactPaths | null {
  const trimmedPath = licensePath?.trim();
  if (!trimmedPath) {
    return null;
  }

  const licenseDirectory = dirname(resolve(trimmedPath));
  return {
    licenseDirectory,
    lastVerifiedLicensePath: join(licenseDirectory, 'bellfield-license-cache.json'),
    terminationReceiptsDirectory: join(licenseDirectory, 'entitlement-receipts')
  };
}

export function readOptionalLicenseArtifactFile(artifactPath: string): OptionalLicenseArtifactRead {
  try {
    if (!existsSync(artifactPath)) {
      return { status: 'missing' };
    }
    return {
      status: 'found',
      rawArtifact: readFileSync(artifactPath, 'utf8')
    };
  } catch (error) {
    return {
      status: 'unreadable',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export function writeLicenseArtifactAtomically(artifactPath: string, rawArtifact: string): void {
  const targetPath = resolve(artifactPath);
  const targetDirectory = dirname(targetPath);
  mkdirSync(targetDirectory, { recursive: true });

  const tempPath = join(
    targetDirectory,
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`
  );

  try {
    writeFileSync(tempPath, rawArtifact, { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, targetPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}
