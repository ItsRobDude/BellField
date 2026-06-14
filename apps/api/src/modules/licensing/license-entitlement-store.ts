import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getEntitlementArtifactPaths,
  readOptionalLicenseArtifactFile,
  writeLicenseArtifactAtomically
} from './license-artifact-cache';
import { verifyLicenseContent, type LicenseVerificationStatus } from './license-verification';
import { resolveLicenseEntitlement, type LicenseEntitlementState } from './license-entitlement';

export type InstalledLicenseEntitlement = {
  current: LicenseVerificationStatus;
  cachedLicense: LicenseVerificationStatus | null;
  terminationReceipts: LicenseVerificationStatus[];
  entitlement: LicenseEntitlementState;
  cacheWriteError?: string;
  receiptReadError?: string;
};

export type ResolveInstalledLicenseEntitlementInput = {
  licensePath: string | undefined;
  publicKeyPem?: string;
  now?: Date;
};

export function resolveInstalledLicenseEntitlement(
  input: ResolveInstalledLicenseEntitlementInput
): InstalledLicenseEntitlement {
  const currentArtifact = readConfiguredLicenseArtifact({
    licensePath: input.licensePath,
    publicKeyPem: input.publicKeyPem
  });
  const paths = getEntitlementArtifactPaths(input.licensePath);
  const cachedArtifact = paths
    ? readSignedArtifact(paths.lastVerifiedLicensePath, input.publicKeyPem)
    : null;
  const terminationReceiptRead = paths
    ? readTerminationReceipts(paths.terminationReceiptsDirectory, input.publicKeyPem)
    : { artifacts: [] };
  const current = currentArtifact.verification;
  const cachedLicense = cachedArtifact?.verification ?? null;
  const terminationReceipts = terminationReceiptRead.artifacts.map(
    (artifact) => artifact.verification
  );
  const entitlement = resolveLicenseEntitlement({
    current,
    cachedLicense,
    terminationReceipts,
    now: input.now ?? new Date()
  });
  let cacheWriteError: string | undefined;
  const cacheCandidate = selectResolvedCacheArtifact(entitlement, {
    current: currentArtifact,
    terminationReceipts: terminationReceiptRead.artifacts
  });

  if (paths && cacheCandidate) {
    try {
      writeLicenseArtifactAtomically(paths.lastVerifiedLicensePath, cacheCandidate.rawArtifact);
    } catch (error) {
      cacheWriteError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    current,
    cachedLicense,
    terminationReceipts,
    entitlement,
    cacheWriteError,
    receiptReadError: terminationReceiptRead.readError
  };
}

type SignedArtifactRead = {
  verification: LicenseVerificationStatus;
  rawArtifact?: string;
};

type CacheableSignedArtifact = SignedArtifactRead & { rawArtifact: string };

type TerminationReceiptsRead = {
  artifacts: SignedArtifactRead[];
  readError?: string;
};

function readConfiguredLicenseArtifact(input: {
  licensePath: string | undefined;
  publicKeyPem: string | undefined;
}): SignedArtifactRead {
  const licensePath = input.licensePath?.trim();
  if (!licensePath) {
    return {
      verification: {
        status: 'missing',
        message: 'BELLFIELD_LICENSE_PATH is not configured.'
      }
    };
  }

  const read = readOptionalLicenseArtifactFile(licensePath);
  if (read.status === 'missing') {
    return {
      verification: {
        status: 'missing',
        message: `License file was not found at ${licensePath}.`
      }
    };
  }
  if (read.status === 'unreadable') {
    return {
      verification: {
        status: 'invalid',
        message: 'License file could not be read.'
      }
    };
  }

  return {
    verification: verifyLicenseContent(read.rawArtifact, input.publicKeyPem),
    rawArtifact: read.rawArtifact
  };
}

function readSignedArtifact(
  artifactPath: string,
  publicKeyPem: string | undefined
): SignedArtifactRead | null {
  const read = readOptionalLicenseArtifactFile(artifactPath);
  if (read.status === 'missing') {
    return null;
  }
  if (read.status === 'unreadable') {
    return {
      verification: {
        status: 'invalid',
        message: read.message
      }
    };
  }
  return {
    verification: verifyLicenseContent(read.rawArtifact, publicKeyPem),
    rawArtifact: read.rawArtifact
  };
}

function readTerminationReceipts(
  directory: string,
  publicKeyPem: string | undefined
): TerminationReceiptsRead {
  if (!existsSync(directory)) {
    return { artifacts: [] };
  }

  try {
    const artifacts = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => readSignedArtifact(join(directory, entry.name), publicKeyPem))
      .filter((artifact): artifact is SignedArtifactRead => Boolean(artifact));
    return { artifacts };
  } catch (error) {
    return {
      artifacts: [],
      readError: error instanceof Error ? error.message : String(error)
    };
  }
}

function selectResolvedCacheArtifact(
  entitlement: LicenseEntitlementState,
  artifacts: {
    current: SignedArtifactRead;
    terminationReceipts: SignedArtifactRead[];
  }
): CacheableSignedArtifact | null {
  if (entitlement.state === 'licenseRecovery' || entitlement.source === 'cache') {
    return null;
  }

  if (entitlement.source === 'current') {
    return artifactMatchesResolvedLicense(artifacts.current, entitlement.license.licenseId)
      ? artifacts.current
      : null;
  }

  return (
    artifacts.terminationReceipts.find((artifact) =>
      artifactMatchesResolvedLicense(artifact, entitlement.license.licenseId)
    ) ?? null
  );
}

function artifactMatchesResolvedLicense(
  artifact: SignedArtifactRead,
  licenseId: string
): artifact is CacheableSignedArtifact {
  return (
    artifact.verification.status === 'valid' &&
    artifact.verification.license.licenseId === licenseId &&
    typeof artifact.rawArtifact === 'string'
  );
}
