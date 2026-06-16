// Worker-local read/write model for the payment_receipt_messages outbox. The
// worker is intentionally not cross-imported with the API; these shapes mirror
// the receipt outbox table and the relay receipt contract.

export type PaymentReceiptKind = 'paymentReceipt' | 'refundReceipt';

export type DueReceipt = {
  id: string;
  kind: PaymentReceiptKind;
  jobId: string;
  /** numeric(12,2) arrives from pg as a string. */
  amount: string;
  currency: string;
  method: string;
  purpose: 'payment' | 'deposit' | null;
  occurredAt: Date;
  attemptCount: number;
  /** Pinned on the first send attempt; null beforehand. */
  recipientEmail: string | null;
  subject: string | null;
  bodyText: string | null;
};

export type ExpiredReceipt = {
  id: string;
  jobId: string;
  kind: PaymentReceiptKind;
};

export type ReceiptSettings = {
  companyName: string;
  replyToEmail: string | null;
  sendPaymentReceipts: boolean;
  paymentReceiptEmailSubject: string;
  paymentReceiptEmailBody: string;
};

export type ReceiptRecipient = {
  email: string | null;
  customerName: string;
  jobNumber: string;
};

export type ReceiptTimelineEntry = {
  jobId: string;
  occurredAt: Date;
  kind: 'paymentReceiptSent' | 'paymentReceiptFailed';
  message: string;
};

export type ReceiptSendOutcome =
  | { kind: 'sent'; relayMessageId?: string }
  | { kind: 'failed'; code: string; retryable: boolean };

export interface ReceiptRelayClient {
  sendReceiptMessage(input: {
    idempotencyKey: string;
    messageType: PaymentReceiptKind;
    recipientEmail: string;
    fromName: string;
    replyToEmail?: string;
    subject: string;
    bodyText: string;
  }): Promise<ReceiptSendOutcome>;
}

export interface PaymentReceiptStore {
  claimDueQueued(now: Date, limit: number): Promise<DueReceipt[]>;
  loadSettings(): Promise<ReceiptSettings>;
  resolveRecipient(jobId: string): Promise<ReceiptRecipient>;
  pinRendered(
    id: string,
    fields: { recipientEmail: string; subject: string; bodyText: string },
    now: Date
  ): Promise<void>;
  markSent(id: string, providerMessageId: string | null, now: Date): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, now: Date): Promise<void>;
  markFailed(id: string, error: string, now: Date): Promise<void>;
  cancel(id: string, now: Date): Promise<void>;
  expireDue(now: Date): Promise<ExpiredReceipt[]>;
  addTimelineEntry(entry: ReceiptTimelineEntry): Promise<void>;
}
