import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getEntitlementArtifactPaths,
  readOptionalLicenseArtifactFile,
  writeLicenseArtifactAtomically
} from './license-artifact-cache';
import {
  verifyLicenseContent,
  verifyLicenseFile,
  type LicenseVerificationStatus
} from './license-verification';
import { resolveLicenseEntitlement, type LicenseEntitlementState } from './license-entitlement';

export type InstalledLicenseEntitlement = {
  current: LicenseVerificationStatus;
  cachedLicense: LicenseVerificationStatus | null;
  terminationReceipts: LicenseVerificationStatus[];
  entitlement: LicenseEntitlementState;
  cacheWriteError?: string;
};

export type ResolveInstalledLicenseEntitlementInput = {
  licensePath: string | undefined;
  publicKeyPem?: string;
  now?: Date;
};

export function resolveInstalledLicenseEntitlement(
  input: ResolveInstalledLicenseEntitlementInput
): InstalledLicenseEntitlement {
  const current = verifyLicenseFile({
    licensePath: input.licensePath,
    publicKeyPem: input.publicKeyPem
  });
  const paths = getEntitlementArtifactPaths(input.licensePath);
  let cacheWriteError: string | undefined;

  if (paths && current.status === 'valid') {
    const rawCurrent = readOptionalLicenseArtifactFile(input.licensePath ?? '');
    if (rawCurrent.status === 'found') {
      try {
        writeLicenseArtifactAtomically(paths.lastVerifiedLicensePath, rawCurrent.rawArtifact);
      } catch (error) {
        cacheWriteError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const cachedLicense = paths
    ? readSignedArtifact(paths.lastVerifiedLicensePath, input.publicKeyPem)
    : null;
  const terminationReceipts = paths
    ? readTerminationReceipts(paths.terminationReceiptsDirectory, input.publicKeyPem)
    : [];
  const entitlement = resolveLicenseEntitlement({
    current,
    cachedLicense,
    terminationReceipts,
    now: input.now ?? new Date()
  });

  return {
    current,
    cachedLicense,
    terminationReceipts,
    entitlement,
    cacheWriteError
  };
}

function readSignedArtifact(
  artifactPath: string,
  publicKeyPem: string | undefined
): LicenseVerificationStatus | null {
  const read = readOptionalLicenseArtifactFile(artifactPath);
  if (read.status === 'missing') {
    return null;
  }
  if (read.status === 'unreadable') {
    return {
      status: 'invalid',
      message: read.message
    };
  }
  return verifyLicenseContent(read.rawArtifact, publicKeyPem);
}

function readTerminationReceipts(
  directory: string,
  publicKeyPem: string | undefined
): LicenseVerificationStatus[] {
  if (!existsSync(directory)) {
    return [];
  }

  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => readSignedArtifact(join(directory, entry.name), publicKeyPem))
      .filter((status): status is LicenseVerificationStatus => Boolean(status));
  } catch {
    return [];
  }
}
