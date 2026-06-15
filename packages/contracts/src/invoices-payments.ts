import type { EstimateLineItemKind, EstimateDiscount } from './estimates.js';

// --- Invoices (Milestone 7 draft + Milestone 8 posting/lock) --------------------

export type InvoiceStatus = 'draft' | 'posted';

export type InvoiceKind = 'main' | 'adjustment' | 'credit';

/** The correction-record kinds an office user can create against a posted main invoice.
 * 'adjustment' adds a charge; 'credit' reduces what's owed. Both carry positive amounts. */
export type InvoiceAdjustmentKind = 'adjustment' | 'credit';

export type InvoiceLineItemKind = EstimateLineItemKind;

/** Where an invoice line came from. Manual office entry, reflected register work, or a converted estimate. */
export type InvoiceLineSourceKind = 'manual' | 'register' | 'estimate';

/** Whether an invoice line still mirrors its source (linked) or was hand-edited by office (detached). */
export type InvoiceLineSourceSyncState = 'linked' | 'detached';

export interface InvoiceLineItemSummary {
  id: string;
  invoiceId: string;
  position: number;
  kind: InvoiceLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
  lineSubtotal: number;
  lineCost?: number;
  sourceKind: InvoiceLineSourceKind;
  sourceSyncState: InvoiceLineSourceSyncState;
  createdAt: string;
  updatedAt: string;
}

/** Snapshotted invoice totals (dollars), same shape and engine source as estimate totals. */
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
  totalCost: number;
  profit: number;
  marginBasisPoints: number | null;
  costComplete: boolean;
}

/**
 * Customer/location/job display context frozen onto an invoice at the moment it is
 * posted, so later edits to current CRM records never rewrite what a posted invoice
 * meant. Money totals are NOT here — those already freeze on write. Present only when
 * `status === 'posted'`. Address/account-type fields are optional because a customer
 * or location may legitimately have been recorded without complete address data.
 */
export interface PostedInvoiceContext {
  postedAt: string;
  postedByName: string;
  billTo: {
    customerId: string;
    name: string;
    accountType?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  serviceLocation: {
    locationId: string;
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  jobNumber: string;
  workOrderNumber?: string;
}

export interface InvoiceSummary {
  id: string;
  jobId: string;
  invoiceKind: InvoiceKind;
  status: InvoiceStatus;
  taxRateBasisPoints: number;
  discount?: EstimateDiscount;
  lineItems: InvoiceLineItemSummary[];
  totals: InvoiceTotals;
  /** Frozen display context, set once the invoice is posted (see PostedInvoiceContext). */
  posted?: PostedInvoiceContext;
  /** For an adjustment/credit, the main invoice it corrects. Null for the main invoice. */
  adjustsInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface InvoiceResponse {
  invoice: InvoiceSummary;
}

/** A job's adjustment/credit correction records (each a full invoice), newest first. */
export interface JobAdjustmentsResponse {
  adjustments: InvoiceSummary[];
}

/** Create an adjustment or credit against a job's posted main invoice. */
export interface CreateAdjustmentRequest {
  kind: InvoiceAdjustmentKind;
}

/**
 * Net amount billed on a job across its POSTED invoices: the posted main total plus
 * posted adjustments minus posted credits. "Billed" means posted/accounting-visible, so a
 * draft main contributes 0 (`mainInvoiceStatus` says whether it is posted yet). `netBilled`
 * may be negative (a net credit balance). `paidTotal` is the sum of the job's non-void
 * payments and `refundedTotal` the sum of its non-void refunds; `amountDue` =
 * netBilled − paidTotal + refundedTotal (may be negative = overpaid/credit balance).
 */
export interface JobInvoiceBalance {
  jobId: string;
  mainInvoiceStatus: InvoiceStatus;
  postedMainTotal: number;
  postedAdjustmentsTotal: number;
  postedCreditsTotal: number;
  netBilled: number;
  paidTotal: number;
  refundedTotal: number;
  amountDue: number;
}

// --- Payments ------------------------------------------------------------------

/** How a manually recorded payment was tendered. */
export type PaymentMethod = 'cash' | 'check' | 'card' | 'ach' | 'other';

export type PaymentSource = 'manual' | 'bellfieldPayments';

export type PaymentProvider = 'stripe';

export interface PaymentAllocation {
  invoiceId: string;
  invoiceKind: InvoiceKind;
  amount: number;
}

/**
 * A payment received for a job. It is an append-only ledger entry: it never changes
 * invoice totals; the job's amount due is derived as net billed − non-void payments
 * plus active refunds. `allocations` records how the receipt applies to posted
 * charge invoices. A correction is a void (`isVoid`), not an edit of the amount.
 */
export interface Payment {
  id: string;
  jobId: string;
  /** Legacy/display anchor for older/manual flows; allocations are authoritative. */
  invoiceId?: string;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  provider?: PaymentProvider;
  currency: string;
  receivedAt: string;
  reference?: string;
  memo?: string;
  recordedByName: string;
  processorFee?: number;
  applicationFee?: number;
  providerPaymentId?: string;
  providerSessionId?: string;
  allocations: PaymentAllocation[];
  isVoid: boolean;
  voidReason?: string;
  voidedByName?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Record a payment against a posted invoice. Amount is positive dollars. */
export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  /** ISO date/time the payment was received. Defaults to now when omitted. */
  receivedAt?: string;
  reference?: string;
  memo?: string;
}

/** Void an existing payment (the correction path; payments are never edited in place). */
export interface VoidPaymentRequest {
  reason?: string;
}

export interface PaymentResponse {
  payment: Payment;
}

export interface PaymentRefundAllocation {
  invoiceId: string;
  invoiceKind: InvoiceKind;
  amount: number;
}

/**
 * Money returned on a job, reversing all or part of a payment. Append-only, like
 * a payment: it never rewrites a posted invoice; the job's amount due rises by
 * the refunded amount. `allocations` reverses the original payment's allocations.
 * A manual refund is recorded by the office; an online refund row is created by
 * the worker only when the Stripe refund event is confirmed.
 */
export interface PaymentRefund {
  id: string;
  paymentId: string;
  jobId: string;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  provider?: PaymentProvider;
  currency: string;
  refundedAt: string;
  reason?: string;
  recordedByName: string;
  /** The application fee BellField returned for the refunded portion (online). */
  applicationFeeRefunded?: number;
  providerRefundId?: string;
  providerPaymentId?: string;
  allocations: PaymentRefundAllocation[];
  createdAt: string;
  updatedAt: string;
}

/** Refund all or part of a payment. Amount is positive dollars (≤ the payment's unrefunded amount). */
export interface RecordRefundRequest {
  amount: number;
  reason?: string;
}

export interface PaymentRefundResponse {
  refund: PaymentRefund;
}

/** A job's payments and refunds across its posted invoices, newest first. */
export interface JobPaymentsResponse {
  payments: Payment[];
  refunds: PaymentRefund[];
}

export type OnlinePaymentLinkState =
  | 'paymentsNotConfigured'
  | 'paymentsDisabled'
  | 'confirmationRequired'
  | 'created'
  | 'providerError';

export interface CreateOnlinePaymentLinkRequest {
  customerEmail?: string;
  confirmSameAmountCharge?: boolean;
}

export type OnlinePaymentLinkResponse =
  | {
      state: 'created';
      checkoutUrl: string;
      paymentSessionId: string;
      amount: number;
      currency: string;
      expiresAt: string;
      reusedExisting?: boolean;
    }
  | {
      state: 'confirmationRequired';
      code: 'sameAmountPreviouslyPaid';
      amount: number;
      currency: string;
      message: string;
    }
  | {
      state: Exclude<OnlinePaymentLinkState, 'created' | 'confirmationRequired'>;
      message?: string;
    };

// --- Online refunds (Phase 6b slice 2) -----------------------------------------

/**
 * Request an online (Stripe-via-relay) refund of a provider-confirmed card
 * payment. Amount is positive dollars, ≤ the payment's still-refundable amount.
 * This only opens a PENDING refund: the confirmed refund row is written by the
 * worker from a Stripe refund event, never synchronously by this request.
 */
export interface OnlineRefundRequest {
  amount: number;
  reason?: string;
}

export type OnlineRefundState = 'requested' | 'failed' | 'paymentsNotConfigured' | 'providerError';

/**
 * `requested` means the relay accepted the refund and it is now pending; the
 * worker records the confirmed refund when the Stripe event arrives.
 * `providerError` is transient — the request stays open and the office may retry.
 * `failed` is a terminal rejection. `paymentsNotConfigured` means this server has
 * no relay configured.
 */
export type OnlineRefundResponse =
  | {
      state: 'requested';
      /** The local pending online-refund request id. */
      refundRequestId: string;
      amount: number;
      currency: string;
    }
  | {
      state: Exclude<OnlineRefundState, 'requested'>;
      message?: string;
    };

/** A manual invoice line the office adds, or the shape it edits a line into. */
export interface InvoiceLineItemInput {
  kind: InvoiceLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
}

export interface VoidInvoiceLineItemRequest {
  reason?: string;
}
