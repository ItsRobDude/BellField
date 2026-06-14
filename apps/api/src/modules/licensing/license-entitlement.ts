import type {
  BellFieldDataOnlyLicenseBody,
  BellFieldTrialLicenseBody,
  LicenseVerificationStatus,
  VerifiedBellFieldLicense
} from './license-verification';

export type EntitlementArtifactSource = 'current' | 'cache' | 'terminationReceipt';

export type LicenseEntitlementState =
  | {
      state: 'paidOperational';
      source: EntitlementArtifactSource;
      license: VerifiedBellFieldLicense;
      warning?: string;
    }
  | {
      state: 'trialOperational';
      source: EntitlementArtifactSource;
      license: VerifiedBellFieldLicense & BellFieldTrialLicenseBody;
      operationEnd: string;
      warning?: string;
    }
  | {
      state: 'trialExpiredDataOnly';
      source: EntitlementArtifactSource;
      license: VerifiedBellFieldLicense & BellFieldTrialLicenseBody;
      operationEnd: string;
      warning?: string;
    }
  | {
      state: 'refundedDataOnly';
      source: EntitlementArtifactSource;
      license: VerifiedBellFieldLicense & BellFieldDataOnlyLicenseBody;
      terminatedLicenseId: string;
      warning?: string;
    }
  | {
      state: 'licenseRecovery';
      reason: 'missing' | 'invalid' | 'noVerifiedArtifact';
      message: string;
    };

export type ResolveLicenseEntitlementInput = {
  current: LicenseVerificationStatus;
  cachedLicense?: LicenseVerificationStatus | null;
  terminationReceipts?: LicenseVerificationStatus[];
  now: Date;
};

type ValidArtifact = {
  source: EntitlementArtifactSource;
  license: VerifiedBellFieldLicense;
};

export function resolveLicenseEntitlement(
  input: ResolveLicenseEntitlementInput
): LicenseEntitlementState {
  const currentArtifact = validArtifact('current', input.current);
  const cachedArtifact = validArtifact('cache', input.cachedLicense ?? null);
  const receiptArtifacts = (input.terminationReceipts ?? [])
    .map((receipt) => validArtifact('terminationReceipt', receipt))
    .filter((receipt): receipt is ValidArtifact => Boolean(receipt));
  const validArtifacts = [currentArtifact, cachedArtifact, ...receiptArtifacts].filter(
    (artifact): artifact is ValidArtifact => Boolean(artifact)
  );
  const dataOnlyArtifacts = validArtifacts.filter((artifact) => isDataOnly(artifact.license));

  if (currentArtifact) {
    const currentState = artifactState(currentArtifact, dataOnlyArtifacts, input.now);
    if (currentState) {
      return currentState;
    }
  }

  if (cachedArtifact) {
    const cachedState = artifactState(cachedArtifact, dataOnlyArtifacts, input.now);
    if (cachedState) {
      return cachedState;
    }
  }

  const directDataOnlyArtifact = dataOnlyArtifacts[0];
  if (directDataOnlyArtifact && isDataOnly(directDataOnlyArtifact.license)) {
    return dataOnlyState(directDataOnlyArtifact);
  }

  if (input.current.status === 'missing') {
    return {
      state: 'licenseRecovery',
      reason: 'missing',
      message: input.current.message
    };
  }
  if (input.current.status === 'invalid') {
    return {
      state: 'licenseRecovery',
      reason: 'invalid',
      message: input.current.message
    };
  }
  return {
    state: 'licenseRecovery',
    reason: 'noVerifiedArtifact',
    message: 'No verified license artifact is available.'
  };
}

function validArtifact(
  source: EntitlementArtifactSource,
  status: LicenseVerificationStatus | null
): ValidArtifact | null {
  if (!status || status.status !== 'valid') {
    return null;
  }
  return { source, license: status.license };
}

function firstOperationalArtifact(artifact: ValidArtifact | null): ValidArtifact | null {
  if (!artifact || isDataOnly(artifact.license)) {
    return null;
  }
  return artifact;
}

function artifactState(
  artifact: ValidArtifact,
  dataOnlyArtifacts: ValidArtifact[],
  now: Date
): LicenseEntitlementState | null {
  if (isDataOnly(artifact.license)) {
    return dataOnlyState(artifact);
  }

  const operationalArtifact = firstOperationalArtifact(artifact);
  if (!operationalArtifact) {
    return null;
  }

  const terminatingArtifact = dataOnlyArtifacts.find(
    (dataOnlyArtifact) =>
      isDataOnly(dataOnlyArtifact.license) &&
      dataOnlyArtifact.license.terminatedLicenseId === operationalArtifact.license.licenseId
  );
  if (terminatingArtifact && isDataOnly(terminatingArtifact.license)) {
    return dataOnlyState(terminatingArtifact);
  }

  return operationalState(operationalArtifact, now);
}

function operationalState(artifact: ValidArtifact, now: Date): LicenseEntitlementState {
  const warning = fallbackWarning(artifact);
  if (isTrial(artifact.license)) {
    return isTrialActive(artifact.license, now)
      ? {
          state: 'trialOperational',
          source: artifact.source,
          license: artifact.license,
          operationEnd: artifact.license.operationEnd,
          warning
        }
      : {
          state: 'trialExpiredDataOnly',
          source: artifact.source,
          license: artifact.license,
          operationEnd: artifact.license.operationEnd,
          warning
        };
  }

  return {
    state: 'paidOperational',
    source: artifact.source,
    license: artifact.license,
    warning
  };
}

function dataOnlyState(artifact: ValidArtifact): LicenseEntitlementState {
  if (!isDataOnly(artifact.license)) {
    throw new Error('Expected a data-only license artifact.');
  }
  return {
    state: 'refundedDataOnly',
    source: artifact.source,
    license: artifact.license,
    terminatedLicenseId: artifact.license.terminatedLicenseId,
    warning: fallbackWarning(artifact)
  };
}

function fallbackWarning(artifact: ValidArtifact): string | undefined {
  return artifact.source === 'cache'
    ? 'Using the last valid signed license artifact because the current license file is unavailable or invalid.'
    : undefined;
}

function isTrial(
  license: VerifiedBellFieldLicense
): license is VerifiedBellFieldLicense & BellFieldTrialLicenseBody {
  return license.schemaVersion === 2 && license.licenseKind === 'trial';
}

function isDataOnly(
  license: VerifiedBellFieldLicense
): license is VerifiedBellFieldLicense & BellFieldDataOnlyLicenseBody {
  return license.schemaVersion === 2 && license.licenseKind === 'dataOnly';
}

function isTrialActive(license: BellFieldTrialLicenseBody, now: Date): boolean {
  return now.getTime() < Date.parse(`${license.operationEnd}T00:00:00.000Z`);
}
