import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { workerLog } from '../../common/logger';
import { estimateEmailQueueExpiryMs, nextDeliveryRetryDelayMs } from './delivery-retry-policy';
import type { DeliveryStore, DueQueuedDelivery, RelayDeliveryClient } from './delivery-types';

const DUE_BATCH_SIZE = 10;
const POLL_BATCH_SIZE = 20;
const POLL_RECHECK_MS = 5 * 60_000;
const POLL_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type ProcessDueResult = {
  expired: number;
  sent: number;
  failed: number;
  rescheduled: number;
};

export type PollStatusesResult = {
  polled: number;
  updated: number;
};

type DeliveryServiceOptions = {
  now?: () => Date;
};

export class DeliveryService {
  private readonly now: () => Date;

  constructor(
    private readonly config: { mediaRoot: string },
    private readonly store: DeliveryStore,
    private readonly relayClient: RelayDeliveryClient,
    options?: DeliveryServiceOptions
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  /** Expires overdue queued sends, then retries the due ones (relay plan §6). */
  async processDueDeliveries(input?: { signal?: AbortSignal }): Promise<ProcessDueResult> {
    const now = this.now();
    const summary: ProcessDueResult = { expired: 0, sent: 0, failed: 0, rescheduled: 0 };

    const expired = await this.store.expireDue(
      now,
      new Date(now.getTime() - estimateEmailQueueExpiryMs)
    );
    summary.expired = expired.length;
    for (const message of expired) {
      await this.store.addTimelineEntry({
        jobId: message.jobId,
        occurredAt: now,
        actorName: message.sentByName,
        kind: deliveryTimelineKind(message.documentType, false),
        message: deliveryTimelineMessage(message, false)
      });
    }

    const due = await this.store.claimDueQueued(now, DUE_BATCH_SIZE);
    for (const message of due) {
      if (input?.signal?.aborted) {
        break;
      }
      await this.attemptDelivery(message, summary);
    }
    return summary;
  }

  /** Polls the relay for delivered/bounced/complained on recently sent mail. */
  async pollDeliveryStatuses(): Promise<PollStatusesResult> {
    const now = this.now();
    const pollable = await this.store.listPollable(
      new Date(now.getTime() - POLL_RECHECK_MS),
      new Date(now.getTime() - POLL_WINDOW_MS),
      POLL_BATCH_SIZE
    );

    let updated = 0;
    for (const message of pollable) {
      const outcome = await this.relayClient.getMessageStatus(message.providerMessageId);
      if (outcome.kind === 'unavailable') {
        // Transient relay problem; leave untouched so the next run retries.
        continue;
      }
      if (outcome.kind === 'notFound' || outcome.state === 'sent' || outcome.state === 'failed') {
        await this.store.touchStatusChecked(message.id, now);
        continue;
      }
      const applied = await this.store.applyDeliveryState(message.id, outcome.state, now);
      if (applied) {
        updated += 1;
      } else {
        await this.store.touchStatusChecked(message.id, now);
      }
    }
    return { polled: pollable.length, updated };
  }

  /**
   * Fetches undelivered customer decisions from the relay, applies each with
   * the 6a rules (actor "Customer", version guard, office-wins), and acks.
   * An apply failure skips the ack so the relay redelivers; the applied-at
   * stamp makes redelivery idempotent.
   */
  async pollAcceptanceDecisions(): Promise<{ fetched: number; applied: number }> {
    const outcome = await this.relayClient.getAcceptanceDecisions();
    if (outcome.kind === 'unavailable') {
      return { fetched: 0, applied: 0 };
    }
    let applied = 0;
    for (const decision of outcome.decisions) {
      try {
        const result = await this.store.applyAcceptanceDecision(decision, this.now());
        if (result === 'applied') {
          applied += 1;
        }
      } catch (error) {
        workerLog('error', 'Customer acceptance decision could not be applied; will retry.', {
          acceptanceLinkId: decision.acceptanceLinkId,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
      await this.relayClient.acknowledgeAcceptanceDecision(decision.acceptanceLinkId);
    }
    return { fetched: outcome.decisions.length, applied };
  }

  private async attemptDelivery(
    message: DueQueuedDelivery,
    summary: ProcessDueResult
  ): Promise<void> {
    const occurredAt = this.now();

    let pdfBytes: Buffer;
    try {
      pdfBytes = await this.readSnapshot(message.snapshotStoragePath, message.snapshotSha256);
    } catch (error) {
      workerLog('error', `Queued ${message.documentType} email snapshot could not be read.`, {
        outboundMessageId: message.id,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      await this.store.markFailed(message.id, 'unknown', occurredAt);
      await this.addOutcomeTimeline(message, false, occurredAt);
      summary.failed += 1;
      return;
    }

    const outcome = await this.relayClient.sendEstimateDocument({
      // Same key the synchronous attempt used: the relay replays a recorded
      // outcome instead of double-sending.
      idempotencyKey: `${message.documentType}-send-${message.id}`,
      recipientEmail: message.recipientEmail,
      fromName: message.fromName ?? '',
      replyToEmail: message.replyToEmail ?? undefined,
      subject: message.subject,
      bodyText: message.bodyText,
      document: { filename: message.snapshotFilename, bytes: pdfBytes },
      // Frozen at queue time: estimate retries mint the link the office saw.
      acceptance:
        message.documentType === 'estimate' ? (message.acceptancePayload ?? undefined) : undefined
    });

    if (outcome.kind === 'sent') {
      await this.store.markSent(
        message.id,
        outcome.relayMessageId && outcome.relayMessageId !== 'unrecorded'
          ? outcome.relayMessageId
          : null,
        occurredAt,
        message.documentType === 'estimate' && outcome.acceptanceLinkId && outcome.acceptanceUrl
          ? {
              linkId: outcome.acceptanceLinkId,
              url: outcome.acceptanceUrl,
              expiresAt: acceptanceLinkExpiryFrom(
                occurredAt,
                message.acceptancePayload?.expiresInDays
              )
            }
          : undefined
      );
      await this.addOutcomeTimeline(message, true, occurredAt);
      summary.sent += 1;
      return;
    }

    if (!outcome.retryable) {
      await this.store.markFailed(message.id, outcome.code, occurredAt);
      await this.addOutcomeTimeline(message, false, occurredAt);
      summary.failed += 1;
      return;
    }

    const failedAttemptNumber = message.attemptCount + 1;
    await this.store.scheduleRetry(
      message.id,
      new Date(occurredAt.getTime() + nextDeliveryRetryDelayMs(failedAttemptNumber)),
      occurredAt
    );
    summary.rescheduled += 1;
  }

  private async addOutcomeTimeline(
    message: DueQueuedDelivery,
    sent: boolean,
    occurredAt: Date
  ): Promise<void> {
    await this.store.addTimelineEntry({
      jobId: message.jobId,
      occurredAt,
      actorName: message.sentByName,
      kind: deliveryTimelineKind(message.documentType, sent),
      message: deliveryTimelineMessage(message, sent)
    });
  }

  private async readSnapshot(storagePath: string, expectedSha256: string): Promise<Buffer> {
    const root = path.resolve(this.config.mediaRoot);
    const candidate = path.resolve(root, storagePath);
    const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
    if (candidate !== root && !candidate.startsWith(normalizedRoot)) {
      throw new Error('Snapshot path escaped the configured media root.');
    }
    const bytes = await readFile(candidate);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expectedSha256) {
      throw new Error('Stored PDF hash did not match its delivery snapshot.');
    }
    return bytes;
  }
}

function deliveryTimelineKind(
  documentType: 'estimate' | 'invoice',
  sent: boolean
): 'estimateSent' | 'estimateDeliveryFailed' | 'invoiceSent' | 'invoiceDeliveryFailed' {
  if (documentType === 'invoice') {
    return sent ? 'invoiceSent' : 'invoiceDeliveryFailed';
  }
  return sent ? 'estimateSent' : 'estimateDeliveryFailed';
}

function deliveryTimelineMessage(
  message: Pick<DueQueuedDelivery, 'documentType' | 'documentTitle' | 'recipientEmail'>,
  sent: boolean
): string {
  const label = message.documentType === 'invoice' ? 'Invoice' : 'Estimate';
  const action = sent ? 'sent to' : 'delivery failed for';
  return `${label} ${action} ${message.recipientEmail}: ${message.documentTitle}.`;
}

// Keep this in sync with relayAcceptanceExpiryDays in packages/contracts.
// The relay enforces the real expiry; the worker only caches the install-side display timestamp.
const acceptanceExpiryDays = {
  min: 7,
  max: 90,
  default: 30
} as const;

function acceptanceLinkExpiryFrom(sentAt: Date, expiresInDays: number | undefined): Date {
  const days = Number.isInteger(expiresInDays)
    ? Math.min(
        acceptanceExpiryDays.max,
        Math.max(acceptanceExpiryDays.min, expiresInDays as number)
      )
    : acceptanceExpiryDays.default;
  return new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000);
}
