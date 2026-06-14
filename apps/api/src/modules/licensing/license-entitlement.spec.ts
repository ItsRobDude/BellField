import {
  licenseKeyId,
  type BellFieldDataOnlyLicenseBody,
  type BellFieldLegacyLicenseBody,
  type BellFieldLicenseBody,
  type BellFieldPaidLicenseBody,
  type BellFieldTrialLicenseBody,
  type LicenseVerificationStatus,
  type VerifiedBellFieldLicense
} from './license-verification';
import { resolveLicenseEntitlement, type LicenseEntitlementState } from './license-entitlement';

const now = new Date('2026-06-13T12:00:00.000Z');

function legacyPaid(
  overrides: Partial<BellFieldLegacyLicenseBody> = {}
): BellFieldLegacyLicenseBody {
  return {
    schemaVersion: 1,
    licenseId: 'lic_legacy_paid_001',
    shopName: 'Legacy Paid Shop',
    issuedAt: '2026-06-01T00:00:00.000Z',
    updateWindowEnd: '2027-06-01',
    ...overrides
  };
}

function paid(overrides: Partial<BellFieldPaidLicenseBody> = {}): BellFieldPaidLicenseBody {
  return {
    schemaVersion: 2,
    licenseKind: 'paid',
    licenseId: 'lic_paid_001',
    shopName: 'Paid Shop',
    issuedAt: '2026-06-01T00:00:00.000Z',
    updateWindowEnd: '2027-06-01',
    ...overrides
  };
}

function trial(overrides: Partial<BellFieldTrialLicenseBody> = {}): BellFieldTrialLicenseBody {
  return {
    schemaVersion: 2,
    licenseKind: 'trial',
    licenseId: 'lic_trial_001',
    shopName: 'Trial Shop',
    issuedAt: '2026-06-01T00:00:00.000Z',
    updateWindowEnd: '2026-07-01',
    operationEnd: '2026-06-14',
    ...overrides
  };
}

function dataOnly(
  overrides: Partial<BellFieldDataOnlyLicenseBody> = {}
): BellFieldDataOnlyLicenseBody {
  return {
    schemaVersion: 2,
    licenseKind: 'dataOnly',
    licenseId: 'lic_data_only_001',
    terminatedLicenseId: 'lic_paid_001',
    shopName: 'Refunded Shop',
    issuedAt: '2026-06-13T00:00:00.000Z',
    terminationReason: 'refund',
    ...overrides
  };
}

function verified(license: BellFieldLicenseBody): VerifiedBellFieldLicense {
  return {
    ...license,
    keyId: licenseKeyId
  };
}

function valid(license: BellFieldLicenseBody): LicenseVerificationStatus {
  return {
    status: 'valid',
    license: verified(license)
  };
}

function missing(message = 'License file was not found.'): LicenseVerificationStatus {
  return {
    status: 'missing',
    message
  };
}

function invalid(message = 'License file is invalid.'): LicenseVerificationStatus {
  return {
    status: 'invalid',
    message
  };
}

function expectEntitlementState<TState extends LicenseEntitlementState['state']>(
  entitlement: LicenseEntitlementState,
  state: TState
): asserts entitlement is Extract<LicenseEntitlementState, { state: TState }> {
  expect(entitlement.state).toBe(state);
}

describe('resolveLicenseEntitlement', () => {
  it('treats legacy v1 licenses as paid operational', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(legacyPaid()),
      now
    });

    expectEntitlementState(entitlement, 'paidOperational');
    expect(entitlement.source).toBe('current');
  });

  it('treats v2 paid licenses as paid operational', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(paid()),
      now
    });

    expectEntitlementState(entitlement, 'paidOperational');
    expect(entitlement.source).toBe('current');
  });

  it('keeps an active trial operational until operationEnd', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(trial({ operationEnd: '2026-06-14' })),
      now
    });

    expectEntitlementState(entitlement, 'trialOperational');
    expect(entitlement.source).toBe('current');
  });

  it('degrades an expired trial to data-only', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(trial({ operationEnd: '2026-06-12' })),
      now
    });

    expectEntitlementState(entitlement, 'trialExpiredDataOnly');
    expect(entitlement.source).toBe('current');
  });

  it('keeps a trial active through the named UTC operationEnd date', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(trial({ operationEnd: '2026-06-13' })),
      now: new Date('2026-06-13T23:59:59.999Z')
    });

    expectEntitlementState(entitlement, 'trialOperational');
    expect(entitlement.source).toBe('current');
  });

  it('expires a trial at the start of the next UTC date', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(trial({ operationEnd: '2026-06-13' })),
      now: new Date('2026-06-14T00:00:00.000Z')
    });

    expectEntitlementState(entitlement, 'trialExpiredDataOnly');
    expect(entitlement.source).toBe('current');
  });

  it('treats a current data-only license as data-only even with an unrelated paid cache', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(dataOnly({ terminatedLicenseId: 'lic_old_paid_001' })),
      cachedLicense: valid(paid({ licenseId: 'lic_new_paid_001' })),
      now
    });

    expectEntitlementState(entitlement, 'refundedDataOnly');
    expect(entitlement.source).toBe('current');
  });

  it('falls open to a last valid signed paid cache when the current license is missing', () => {
    const entitlement = resolveLicenseEntitlement({
      current: missing(),
      cachedLicense: valid(paid()),
      now
    });

    expectEntitlementState(entitlement, 'paidOperational');
    expect(entitlement.source).toBe('cache');
    expect(entitlement.warning).toMatch(/last valid signed license/i);
  });

  it('applies trial rules from a signed trial cache when the current license is invalid', () => {
    const entitlement = resolveLicenseEntitlement({
      current: invalid(),
      cachedLicense: valid(trial({ operationEnd: '2026-06-14' })),
      now
    });

    expectEntitlementState(entitlement, 'trialOperational');
    expect(entitlement.source).toBe('cache');
  });

  it('does not upgrade an expired signed trial cache to paid', () => {
    const entitlement = resolveLicenseEntitlement({
      current: missing(),
      cachedLicense: valid(trial({ operationEnd: '2026-06-12' })),
      now
    });

    expectEntitlementState(entitlement, 'trialExpiredDataOnly');
    expect(entitlement.source).toBe('cache');
  });

  it('keeps a signed data-only cache data-only', () => {
    const entitlement = resolveLicenseEntitlement({
      current: missing(),
      cachedLicense: valid(dataOnly()),
      now
    });

    expectEntitlementState(entitlement, 'refundedDataOnly');
    expect(entitlement.source).toBe('cache');
  });

  it('requires recovery when no signed artifact exists and the current license is missing', () => {
    const entitlement = resolveLicenseEntitlement({
      current: missing('BELLFIELD_LICENSE_PATH is not configured.'),
      cachedLicense: invalid('Plaintext cache is not a signed license envelope.'),
      now
    });

    expect(entitlement).toEqual({
      state: 'licenseRecovery',
      reason: 'missing',
      message: 'BELLFIELD_LICENSE_PATH is not configured.'
    });
  });

  it('requires recovery when no signed artifact exists and the current license is invalid', () => {
    const entitlement = resolveLicenseEntitlement({
      current: invalid('License signature did not verify.'),
      now
    });

    expect(entitlement).toEqual({
      state: 'licenseRecovery',
      reason: 'invalid',
      message: 'License signature did not verify.'
    });
  });

  it('lets a signed data-only receipt supersede the matching current paid license', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(paid({ licenseId: 'lic_paid_001' })),
      terminationReceipts: [valid(dataOnly({ terminatedLicenseId: 'lic_paid_001' }))],
      now
    });

    expectEntitlementState(entitlement, 'refundedDataOnly');
    expect(entitlement.source).toBe('terminationReceipt');
    expect(entitlement.terminatedLicenseId).toBe('lic_paid_001');
  });

  it('lets a signed data-only receipt supersede the matching cached paid license', () => {
    const entitlement = resolveLicenseEntitlement({
      current: missing(),
      cachedLicense: valid(paid({ licenseId: 'lic_paid_001' })),
      terminationReceipts: [valid(dataOnly({ terminatedLicenseId: 'lic_paid_001' }))],
      now
    });

    expectEntitlementState(entitlement, 'refundedDataOnly');
    expect(entitlement.source).toBe('terminationReceipt');
  });

  it('ignores unrelated signed data-only receipts for a different paid license', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(paid({ licenseId: 'lic_paid_001' })),
      terminationReceipts: [valid(dataOnly({ terminatedLicenseId: 'lic_other_paid_001' }))],
      now
    });

    expectEntitlementState(entitlement, 'paidOperational');
    expect(entitlement.source).toBe('current');
  });

  it('ignores unsigned or invalid termination receipt entries', () => {
    const entitlement = resolveLicenseEntitlement({
      current: valid(paid({ licenseId: 'lic_paid_001' })),
      terminationReceipts: [invalid('Unsigned termination receipt.')],
      now
    });

    expectEntitlementState(entitlement, 'paidOperational');
    expect(entitlement.source).toBe('current');
  });
});
