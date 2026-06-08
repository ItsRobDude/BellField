import type { InvoiceKind } from './invoices-payments.js';
import type { PaymentMethod } from './invoices-payments.js';

// --- Bookkeeping workbench (Milestone 8) ----------------------------------------

/** One invoice in a bookkeeping worklist (ready-to-post or recently-posted). */
export interface BookkeepingInvoiceItem {
  invoiceId: string;
  jobId: string;
  jobNumber: string;
  invoiceKind: InvoiceKind;
  customerName: string;
  total: number;
  postedAt?: string;
  updatedAt: string;
}

/** One job with an outstanding balance in the open-balance worklist. */
export interface BookkeepingBalanceItem {
  jobId: string;
  jobNumber: string;
  customerName: string;
  netBilled: number;
  paidTotal: number;
  amountDue: number;
}

/** A read-only deposit prep grouping. It is not a posted deposit record; it only
 * groups non-void payments by received date and method for office review/export prep. */
export interface BookkeepingPaymentBatchItem {
  batchDate: string;
  method: PaymentMethod;
  paymentCount: number;
  totalAmount: number;
  latestReceivedAt: string;
}

/**
 * Cross-job bookkeeping worklists (each bounded): main drafts ready to post, jobs with
 * an outstanding balance, and recently posted invoices. A read-only review surface.
 */
export interface BookkeepingQueuesResponse {
  readyToPost: BookkeepingInvoiceItem[];
  openBalance: BookkeepingBalanceItem[];
  recentlyPosted: BookkeepingInvoiceItem[];
  paymentBatches: BookkeepingPaymentBatchItem[];
}
