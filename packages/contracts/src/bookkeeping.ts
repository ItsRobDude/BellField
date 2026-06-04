import type { InvoiceKind } from './invoices-payments.js';

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

/**
 * Cross-job bookkeeping worklists (each bounded): main drafts ready to post, jobs with
 * an outstanding balance, and recently posted invoices. A read-only review surface.
 */
export interface BookkeepingQueuesResponse {
  readyToPost: BookkeepingInvoiceItem[];
  openBalance: BookkeepingBalanceItem[];
  recentlyPosted: BookkeepingInvoiceItem[];
}
