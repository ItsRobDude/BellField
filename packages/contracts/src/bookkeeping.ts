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

export type BookkeepingQueueKey =
  | 'readyToPost'
  | 'openBalance'
  | 'recentlyPosted'
  | 'paymentBatches';

/** Paging state for one worklist: its true row count and, when rows exist past this page, an
 * opaque cursor that fetches the next page (`<queue>Cursor` query parameter). */
export interface BookkeepingQueuePaging {
  totalCount: number;
  nextCursor?: string;
}

/**
 * Cross-job bookkeeping worklists: main drafts ready to post, jobs with an outstanding
 * balance, and recently posted invoices. A read-only review surface. Each worklist is paged
 * (`limit` rows per request) and `paging` carries its true total plus next-page cursor, so a
 * page boundary never hides an open balance.
 */
export interface BookkeepingQueuesResponse {
  limit: number;
  readyToPost: BookkeepingInvoiceItem[];
  openBalance: BookkeepingBalanceItem[];
  recentlyPosted: BookkeepingInvoiceItem[];
  paymentBatches: BookkeepingPaymentBatchItem[];
  paging: Record<BookkeepingQueueKey, BookkeepingQueuePaging>;
}
