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
 * payments; `amountDue` = netBilled − paidTotal (may be negative = overpaid/credit balance).
 */
export interface JobInvoiceBalance {
  jobId: string;
  mainInvoiceStatus: InvoiceStatus;
  postedMainTotal: number;
  postedAdjustmentsTotal: number;
  postedCreditsTotal: number;
  netBilled: number;
  paidTotal: number;
  amountDue: number;
}

// --- Payments (Milestone 8, online-only v1) -------------------------------------

/** How a manually recorded payment was tendered. */
export type PaymentMethod = 'cash' | 'check' | 'card' | 'ach' | 'other';

/**
 * A payment received against a posted invoice. An append-only ledger entry: it never
 * changes invoice totals; the job's amount due is derived as net billed − non-void
 * payments. A correction is a void (`isVoid`), not an edit of the amount.
 */
export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  receivedAt: string;
  reference?: string;
  memo?: string;
  recordedByName: string;
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

/** A job's payments across its posted invoices, newest first. */
export interface JobPaymentsResponse {
  payments: Payment[];
}

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
