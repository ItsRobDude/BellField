import { workerLog } from '../../common/logger';
import { nextDeliveryRetryDelayMs } from '../delivery/delivery-retry-policy';
import type {
  DueReceipt,
  PaymentReceiptStore,
  ReceiptRelayClient,
  ReceiptSettings
} from './receipt-types';

const DUE_BATCH_SIZE = 10;

export type ProcessReceiptsResult = {
  expired: number;
  sent: number;
  failed: number;
  rescheduled: number;
  canceled: number;
};

type ReceiptsServiceOptions = {
  now?: () => Date;
};

/**
 * Sends queued customer receipt emails. Receipts are enqueued (exactly-once)
 * inside the money transaction that records a payment/refund; this loop resolves
 * the recipient, renders the body from current settings, pins them on the first
 * attempt, and sends via the relay — so retries never re-render or drift.
 */
export class PaymentReceiptsService {
  private readonly now: () => Date;

  constructor(
    private readonly store: PaymentReceiptStore,
    private readonly relayClient: ReceiptRelayClient,
    options?: ReceiptsServiceOptions
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  async processDueReceipts(input?: { signal?: AbortSignal }): Promise<ProcessReceiptsResult> {
    const now = this.now();
    const summary: ProcessReceiptsResult = {
      expired: 0,
      sent: 0,
      failed: 0,
      rescheduled: 0,
      canceled: 0
    };

    const expired = await this.store.expireDue(now);
    summary.expired = expired.length;
    for (const receipt of expired) {
      await this.store.addTimelineEntry({
        jobId: receipt.jobId,
        occurredAt: now,
        kind: 'paymentReceiptFailed',
        message: 'Receipt email could not be sent before it expired.'
      });
    }

    const due = await this.store.claimDueQueued(now, DUE_BATCH_SIZE);
    if (due.length === 0) {
      return summary;
    }

    const settings = await this.store.loadSettings();
    for (const receipt of due) {
      if (input?.signal?.aborted) {
        break;
      }
      await this.attemptSend(receipt, settings, summary);
    }
    return summary;
  }

  private async attemptSend(
    receipt: DueReceipt,
    settings: ReceiptSettings,
    summary: ProcessReceiptsResult
  ): Promise<void> {
    const now = this.now();

    // Honor the office toggle at send time: a receipt enqueued while sending was
    // on is canceled (not sent) if the owner has since turned receipts off.
    if (!settings.sendPaymentReceipts) {
      await this.store.cancel(receipt.id, now);
      summary.canceled += 1;
      return;
    }

    let recipientEmail = receipt.recipientEmail;
    let subject = receipt.subject;
    let bodyText = receipt.bodyText;

    // First attempt: resolve + render + pin. Retries reuse the pinned values.
    if (!recipientEmail) {
      const recipient = await this.store.resolveRecipient(receipt.jobId);
      if (!recipient.email) {
        await this.store.markFailed(receipt.id, 'noRecipientEmail', now);
        await this.store.addTimelineEntry({
          jobId: receipt.jobId,
          occurredAt: now,
          kind: 'paymentReceiptFailed',
          message: 'Receipt not sent — no email address on file for this customer.'
        });
        summary.failed += 1;
        return;
      }
      recipientEmail = recipient.email;
      const tokens = receiptTokens(receipt, settings, recipient.customerName, recipient.jobNumber);
      subject = renderTemplate(settings.paymentReceiptEmailSubject, tokens);
      bodyText = renderTemplate(settings.paymentReceiptEmailBody, tokens);
      await this.store.pinRendered(receipt.id, { recipientEmail, subject, bodyText }, now);
    }

    const outcome = await this.relayClient.sendReceiptMessage({
      idempotencyKey: `receipt-${receipt.id}`,
      messageType: receipt.kind,
      recipientEmail,
      fromName: settings.companyName,
      replyToEmail: settings.replyToEmail ?? undefined,
      subject: subject ?? '',
      bodyText: bodyText ?? ''
    });

    if (outcome.kind === 'sent') {
      await this.store.markSent(receipt.id, outcome.relayMessageId ?? null, now);
      await this.store.addTimelineEntry({
        jobId: receipt.jobId,
        occurredAt: now,
        kind: 'paymentReceiptSent',
        message: `Receipt emailed to ${recipientEmail}.`
      });
      summary.sent += 1;
      return;
    }

    if (!outcome.retryable) {
      await this.store.markFailed(receipt.id, outcome.code, now);
      await this.store.addTimelineEntry({
        jobId: receipt.jobId,
        occurredAt: now,
        kind: 'paymentReceiptFailed',
        message: `Receipt email to ${recipientEmail} could not be delivered.`
      });
      summary.failed += 1;
      return;
    }

    const failedAttemptNumber = receipt.attemptCount + 1;
    await this.store.scheduleRetry(
      receipt.id,
      new Date(now.getTime() + nextDeliveryRetryDelayMs(failedAttemptNumber)),
      now
    );
    summary.rescheduled += 1;
    workerLog('info', 'Receipt send deferred for retry.', {
      receiptId: receipt.id,
      attempt: failedAttemptNumber
    });
  }
}

function receiptTokens(
  receipt: DueReceipt,
  settings: ReceiptSettings,
  customerName: string,
  jobNumber: string
): Record<string, string> {
  return {
    companyName: settings.companyName,
    customerName,
    jobNumber,
    amount: formatMoney(receipt.amount, receipt.currency),
    method: capitalize(receipt.method),
    date: formatReceiptDate(receipt.occurredAt),
    receiptKind: receipt.purpose === 'deposit' ? 'deposit' : 'payment'
  };
}

function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : whole
  );
}

function formatMoney(amount: string, currency: string): string {
  const numeric = Number(amount);
  const formatted = Number.isFinite(numeric) ? numeric.toFixed(2) : amount;
  // USD fronts a bare "$"; other currencies are suffixed with the ISO code.
  return currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatReceiptDate(occurredAt: Date): string {
  return occurredAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}
