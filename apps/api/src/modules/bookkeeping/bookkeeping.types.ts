import type {
  BookkeepingBalanceItem,
  BookkeepingInvoiceItem,
  BookkeepingPaymentBatchItem,
  BookkeepingQueueKey,
  BookkeepingQueuesResponse,
  PaymentMethod
} from '@bellfield/contracts';

export type BookkeepingInvoiceItemDto = BookkeepingInvoiceItem;
export type BookkeepingBalanceItemDto = BookkeepingBalanceItem;
export type BookkeepingPaymentBatchItemDto = BookkeepingPaymentBatchItem;
export type BookkeepingQueuesResponseDto = BookkeepingQueuesResponse;

// Keyset cursors: each names the sort key of the last row on the page already delivered, so
// the next page starts strictly after it even when rows are added or change in between.
export type ReadyToPostCursor = { updatedAt: string; id: string };
export type RecentlyPostedCursor = { postedAt: string; id: string };
export type OpenBalanceCursor = { amountDue: number; jobId: string };
export type PaymentBatchCursor = { batchDate: string; method: PaymentMethod };

export type BookkeepingQueuesRequestQuery = {
  limit?: string;
  cursors: Partial<Record<BookkeepingQueueKey, string | undefined>>;
};
