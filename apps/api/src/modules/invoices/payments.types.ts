import type {
  JobPaymentsResponse,
  Payment,
  PaymentAllocation,
  PaymentProvider,
  PaymentMethod,
  PaymentSource,
  PaymentResponse,
  RecordPaymentRequest,
  VoidPaymentRequest
} from '@bellfield/contracts';

// Re-export the contract shapes the payments controller/service speak in, mirroring
// how the rest of the invoices module aliases its DTOs to shared contract types.
export type PaymentMethodValue = PaymentMethod;
export type PaymentSourceValue = PaymentSource;
export type PaymentProviderValue = PaymentProvider;
export type PaymentAllocationRecord = PaymentAllocation;
export type PaymentSummaryDto = Payment;
export type PaymentResponseDto = PaymentResponse;
export type JobPaymentsResponseDto = JobPaymentsResponse;
export type RecordPaymentRequestDto = RecordPaymentRequest;
export type VoidPaymentRequestDto = VoidPaymentRequest;

export const paymentMethods = [
  'cash',
  'check',
  'card',
  'ach',
  'other'
] as const satisfies readonly PaymentMethodValue[];

/**
 * A payment as the repository reads/writes it. Money is a decimal-dollar number
 * (numeric(12,2) in the database).
 */
export type PaymentRecord = {
  id: string;
  jobId: string;
  invoiceId?: string;
  amount: number;
  method: PaymentMethodValue;
  source: PaymentSourceValue;
  provider?: PaymentProviderValue;
  currency: string;
  receivedAt: string;
  reference?: string;
  memo?: string;
  recordedByEmployeeId?: string;
  recordedByName: string;
  processorFee?: number;
  applicationFee?: number;
  providerPaymentId?: string;
  providerSessionId?: string;
  allocations: PaymentAllocationRecord[];
  isVoid: boolean;
  voidReason?: string;
  voidedByName?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** Resolved, validated input the service hands the repository to record a payment. */
export type PaymentWriteInput = {
  amount: number;
  method: PaymentMethodValue;
  receivedAt: string;
  reference?: string;
  memo?: string;
  actor: { id: string; displayName: string };
};
