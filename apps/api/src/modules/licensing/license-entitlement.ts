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

type DataOnlyArtifact = ValidArtifact & {
  license: VerifiedBellFieldLicense & BellFieldDataOnlyLicenseBody;
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
  const dataOnlyArtifacts = validArtifacts.filter(isDataOnlyArtifact);

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
  if (directDataOnlyArtifact) {
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

function artifactState(
  artifact: ValidArtifact,
  dataOnlyArtifacts: DataOnlyArtifact[],
  now: Date
): LicenseEntitlementState | null {
  if (isDataOnlyArtifact(artifact)) {
    return dataOnlyState(artifact);
  }

  const terminatingArtifact = dataOnlyArtifacts.find(
    (dataOnlyArtifact) =>
      dataOnlyArtifact.license.terminatedLicenseId === artifact.license.licenseId
  );
  if (terminatingArtifact) {
    return dataOnlyState(terminatingArtifact);
  }

  return operationalState(artifact, now);
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

function dataOnlyState(artifact: DataOnlyArtifact): LicenseEntitlementState {
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

function isDataOnlyArtifact(artifact: ValidArtifact): artifact is DataOnlyArtifact {
  return isDataOnly(artifact.license);
}

function isTrialActive(license: BellFieldTrialLicenseBody, now: Date): boolean {
  // operationEnd is an inclusive, SERVER-LOCAL calendar date: a trial runs
  // through the end of that day on the shop's own machine clock and expires at
  // local midnight the following day. Date-only fields that gate operation are
  // read in the shop's local time — the server PC is the shop's operational
  // clock, matching the field work window's formatLocalDate — never UTC.
  // Comparing zero-padded YYYY-MM-DD strings is chronological, and operationEnd
  // is validated to that shape at verification time.
  return toLocalDateString(now) <= license.operationEnd;
}

function toLocalDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
