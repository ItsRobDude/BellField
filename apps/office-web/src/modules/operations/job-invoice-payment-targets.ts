import type {
  InvoiceSummary,
  JobInvoiceBalance,
  Payment,
  PaymentRefund
} from '@/lib/operations-api';

export type PaymentTargetOption = {
  invoiceId: string;
  label: string;
  remainingAmount: number;
};

export function buildPaymentTargetOptions(input: {
  mainInvoiceId: string;
  mainInvoiceNumber?: string;
  balance: JobInvoiceBalance;
  corrections: InvoiceSummary[];
  payments: Payment[];
  refunds: PaymentRefund[];
}): PaymentTargetOption[] {
  const allocatedByInvoice = new Map<string, number>();
  for (const payment of input.payments) {
    if (payment.isVoid) {
      continue;
    }
    for (const allocation of payment.allocations) {
      addCents(allocatedByInvoice, allocation.invoiceId, dollarsToCents(allocation.amount));
    }
  }

  const refundedByInvoice = new Map<string, number>();
  for (const refund of input.refunds) {
    for (const allocation of refund.allocations) {
      addCents(refundedByInvoice, allocation.invoiceId, dollarsToCents(allocation.amount));
    }
  }

  const targetOptions: PaymentTargetOption[] = [
    buildTargetOption({
      invoiceId: input.mainInvoiceId,
      label: input.mainInvoiceNumber ?? 'Main invoice',
      totalAmount: input.balance.postedMainTotal,
      allocatedByInvoice,
      refundedByInvoice
    })
  ];

  for (const correction of input.corrections) {
    if (correction.status !== 'posted' || correction.invoiceKind !== 'adjustment') {
      continue;
    }
    targetOptions.push(
      buildTargetOption({
        invoiceId: correction.id,
        label: correction.invoiceNumber ?? 'Adjustment',
        totalAmount: correction.totals.total,
        allocatedByInvoice,
        refundedByInvoice
      })
    );
  }

  return targetOptions;
}

export function findPaymentTarget(
  targets: PaymentTargetOption[],
  invoiceId: string
): PaymentTargetOption | null {
  return targets.find((target) => target.invoiceId === invoiceId) ?? targets[0] ?? null;
}

export function defaultPaymentLinkAmountForTarget(
  target: PaymentTargetOption,
  amountDue: number
): string {
  const amount =
    target.remainingAmount > 0 ? Math.min(target.remainingAmount, amountDue) : amountDue;
  return Math.max(amount, 0).toFixed(2);
}

function buildTargetOption(input: {
  invoiceId: string;
  label: string;
  totalAmount: number;
  allocatedByInvoice: Map<string, number>;
  refundedByInvoice: Map<string, number>;
}): PaymentTargetOption {
  const remainingCents = Math.max(
    dollarsToCents(input.totalAmount) -
      (input.allocatedByInvoice.get(input.invoiceId) ?? 0) +
      (input.refundedByInvoice.get(input.invoiceId) ?? 0),
    0
  );
  return {
    invoiceId: input.invoiceId,
    label: input.label,
    remainingAmount: centsToDollars(remainingCents)
  };
}

function addCents(map: Map<string, number>, key: string, amountCents: number): void {
  map.set(key, (map.get(key) ?? 0) + amountCents);
}

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

function centsToDollars(amountCents: number): number {
  return amountCents / 100;
}
