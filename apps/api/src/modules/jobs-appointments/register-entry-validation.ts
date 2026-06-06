import { ConflictException } from '@nestjs/common';
import type { UpdateRegisterEntryRequest } from '@bellfield/contracts';

function validatePositiveNumber(value: number | undefined, message: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new ConflictException(message);
  }
}

function validateNonNegativeNumber(value: number | null | undefined, message: string): void {
  if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new ConflictException(message);
  }
}

/** Numeric sanity for a register create/update: quantity > 0, unit price and total >= 0. */
export function validateRegisterEntryNumbers(request: {
  quantity?: number;
  unitPrice?: number | null;
  totalAmount?: number;
}): void {
  validatePositiveNumber(request.quantity, 'Register entry quantity must be greater than zero.');
  validateNonNegativeNumber(request.unitPrice, 'Register entry unit price cannot be negative.');
  validateNonNegativeNumber(request.totalAmount, 'Register entry total amount cannot be negative.');
}

/** A register update must change at least one editable field, and its numbers must be sane. */
export function validateRegisterEntryUpdate(request: UpdateRegisterEntryRequest): void {
  const hasEditableField =
    request.appointmentId !== undefined ||
    request.kind !== undefined ||
    request.description !== undefined ||
    request.quantity !== undefined ||
    request.unitOfMeasure !== undefined ||
    request.unitPrice !== undefined ||
    request.totalAmount !== undefined ||
    request.partNumber !== undefined ||
    request.inventorySourceLabel !== undefined ||
    request.inventoryItemId !== undefined ||
    request.inventoryLocationId !== undefined ||
    request.billingProjectionState !== undefined;

  if (!hasEditableField) {
    throw new ConflictException('Register entry update must include at least one editable field.');
  }

  validateRegisterEntryNumbers(request);
}
