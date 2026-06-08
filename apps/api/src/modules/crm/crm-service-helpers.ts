import { ConflictException } from '@nestjs/common';

export function ensureLocationContactConfirmation(
  phone: string | undefined,
  email: string | undefined,
  confirmMissingContactInfo: boolean | undefined,
  hasActiveContactMethod = false
): void {
  if (
    !trimOptional(phone) &&
    !trimOptional(email) &&
    !hasActiveContactMethod &&
    !confirmMissingContactInfo
  ) {
    throw new ConflictException(
      'Locations without phone or email need office confirmation before saving.'
    );
  }
}

export function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function detailOptionsFor(employee: { effectivePermissions: readonly string[] }) {
  return {
    includeAgreementContext: employee.effectivePermissions.includes('agreements:view')
  };
}
