export type DueQueuedDelivery = {
  id: string;
  jobId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  /** D8: pinned at queue time; retries send what the office saw. */
  fromName: string | null;
  replyToEmail: string | null;
  sentByName: string;
  attemptCount: number;
  expiresAt: Date | null;
  snapshotStoragePath: string;
  snapshotSha256: string;
  snapshotFilename: string;
  estimateTitle: string | null;
};

export type ExpiredDelivery = {
  id: string;
  jobId: string;
  recipientEmail: string;
  sentByName: string;
  estimateTitle: string | null;
};

export type PollableDelivery = {
  id: string;
  providerMessageId: string;
};

export type DeliveryTimelineEntry = {
  jobId: string;
  occurredAt: Date;
  actorName: string;
  kind: 'estimateSent' | 'estimateDeliveryFailed';
  message: string;
};

export interface DeliveryStore {
  listDueQueued(now: Date, limit: number): Promise<DueQueuedDelivery[]>;
  markSent(id: string, providerMessageId: string | null, sentAt: Date): Promise<void>;
  markFailed(id: string, code: string, failedAt: Date): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, occurredAt: Date): Promise<void>;
  expireDue(now: Date, legacyCutoff: Date): Promise<ExpiredDelivery[]>;
  addTimelineEntry(entry: DeliveryTimelineEntry): Promise<void>;
  listPollable(checkedBefore: Date, sentAfter: Date, limit: number): Promise<PollableDelivery[]>;
  applyDeliveryState(
    id: string,
    state: 'delivered' | 'bounced' | 'complained',
    at: Date
  ): Promise<boolean>;
  touchStatusChecked(id: string, at: Date): Promise<void>;
}

export type RelaySendOutcome =
  | { kind: 'sent'; relayMessageId?: string }
  | { kind: 'failed'; code: string; retryable: boolean };

export type RelayStatusOutcome =
  | { kind: 'status'; state: 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed' }
  | { kind: 'notFound' }
  | { kind: 'unavailable' };

export interface RelayDeliveryClient {
  sendEstimateDocument(input: {
    idempotencyKey: string;
    recipientEmail: string;
    fromName: string;
    replyToEmail?: string;
    subject: string;
    bodyText: string;
    document: { filename: string; bytes: Buffer };
  }): Promise<RelaySendOutcome>;
  getMessageStatus(relayMessageId: string): Promise<RelayStatusOutcome>;
}
