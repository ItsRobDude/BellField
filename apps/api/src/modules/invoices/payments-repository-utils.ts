import { toIsoString } from '../../database/database-row.utils';
import type {
  PaymentAllocationRecord,
  PaymentMethodValue,
  PaymentProviderValue,
  PaymentRecord,
  PaymentRefundAllocationRecord,
  PaymentSourceValue,
  RefundRecord
} from './payments.types';

// Row shapes and pure mappers/helpers for the payments + refunds repositories.
// Extracted so the repository file stays under the source-size guardrail; this
// module holds no query logic, only DB-row types, column lists, and conversions.

export type PaymentRow = {
  id: string;
  jobId: string;
  invoiceId: string | null;
  amount: string | number;
  method: PaymentMethodValue;
  source: 'manual' | 'bellfield_payments';
  purpose: 'payment' | 'deposit';
  provider: PaymentProviderValue | null;
  currency: string;
  receivedAt: string | Date;
  reference: string | null;
  memo: string | null;
  recordedByEmployeeId: string | null;
  recordedByName: string;
  processorFee: string | number | null;
  applicationFee: string | number | null;
  providerPaymentId: string | null;
  providerSessionId: string | null;
  isVoid: boolean;
  voidReason: string | null;
  voidedByName: string | null;
  voidedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type AllocationRow = {
  paymentId: string;
  invoiceId: string;
  invoiceKind: 'main' | 'adjustment' | 'credit';
  invoiceNumber: string | null;
  amount: string | number;
};

export type ChargeInvoiceRow = {
  invoiceId: string;
  invoiceKind: 'main' | 'adjustment';
  total: string | number;
  allocated: string | number;
};

export type TargetInvoiceRow = {
  jobId: string;
  status: string;
  invoiceKind: string;
};

export type RefundRow = {
  id: string;
  paymentId: string;
  jobId: string;
  amount: string | number;
  method: PaymentMethodValue;
  source: 'manual' | 'bellfield_payments';
  provider: PaymentProviderValue | null;
  currency: string;
  refundedAt: string | Date;
  reason: string | null;
  recordedByName: string;
  applicationFeeRefunded: string | number | null;
  providerRefundId: string | null;
  providerPaymentId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type RefundAllocationRow = {
  refundId: string;
  invoiceId: string;
  invoiceKind: 'main' | 'adjustment' | 'credit';
  invoiceNumber: string | null;
  amount: string | number;
};

export const PAYMENT_COLUMNS = `
  id,
  job_id as "jobId",
  invoice_id as "invoiceId",
  amount,
  method,
  source,
  purpose,
  provider,
  currency,
  received_at as "receivedAt",
  reference,
  memo,
  recorded_by_employee_id as "recordedByEmployeeId",
  recorded_by_name as "recordedByName",
  processor_fee_amount as "processorFee",
  application_fee_amount as "applicationFee",
  provider_payment_id as "providerPaymentId",
  provider_session_id as "providerSessionId",
  is_void as "isVoid",
  void_reason as "voidReason",
  voided_by_name as "voidedByName",
  voided_at as "voidedAt",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export const REFUND_COLUMNS = `
  id,
  payment_id as "paymentId",
  job_id as "jobId",
  amount,
  method,
  source,
  provider,
  currency,
  refunded_at as "refundedAt",
  reason,
  refunded_by_name as "recordedByName",
  application_fee_refunded as "applicationFeeRefunded",
  provider_refund_id as "providerRefundId",
  provider_payment_id as "providerPaymentId",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export function formatMoney(amount: number | string): string {
  return `$${Number(amount).toFixed(2)}`;
}

export function dollarsToCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

export function toDbSource(source: PaymentSourceValue): 'manual' | 'bellfield_payments' {
  return source === 'bellfieldPayments' ? 'bellfield_payments' : 'manual';
}

export function fromDbSource(source: PaymentRow['source']): PaymentSourceValue {
  return source === 'bellfield_payments' ? 'bellfieldPayments' : 'manual';
}

export function optionalMoney(value: string | number | null): number | undefined {
  return value === null ? undefined : Number(value);
}

export function toPaymentRecord(
  row: PaymentRow,
  allocations: PaymentAllocationRecord[]
): PaymentRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    invoiceId: row.invoiceId ?? undefined,
    amount: Number(row.amount),
    method: row.method,
    source: fromDbSource(row.source),
    purpose: row.purpose,
    provider: row.provider ?? undefined,
    currency: row.currency,
    receivedAt: toIsoString(row.receivedAt),
    reference: row.reference ?? undefined,
    memo: row.memo ?? undefined,
    recordedByEmployeeId: row.recordedByEmployeeId ?? undefined,
    recordedByName: row.recordedByName,
    processorFee: optionalMoney(row.processorFee),
    applicationFee: optionalMoney(row.applicationFee),
    providerPaymentId: row.providerPaymentId ?? undefined,
    providerSessionId: row.providerSessionId ?? undefined,
    allocations,
    isVoid: row.isVoid,
    voidReason: row.voidReason ?? undefined,
    voidedByName: row.voidedByName ?? undefined,
    voidedAt: row.voidedAt ? toIsoString(row.voidedAt) : undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

export function toRefundRecord(
  row: RefundRow,
  allocations: PaymentRefundAllocationRecord[]
): RefundRecord {
  return {
    id: row.id,
    paymentId: row.paymentId,
    jobId: row.jobId,
    amount: Number(row.amount),
    method: row.method,
    source: fromDbSource(row.source),
    provider: row.provider ?? undefined,
    currency: row.currency,
    refundedAt: toIsoString(row.refundedAt),
    reason: row.reason ?? undefined,
    recordedByName: row.recordedByName,
    applicationFeeRefunded: optionalMoney(row.applicationFeeRefunded),
    providerRefundId: row.providerRefundId ?? undefined,
    providerPaymentId: row.providerPaymentId ?? undefined,
    allocations,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}
