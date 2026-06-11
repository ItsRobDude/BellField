import type { RelaySendFailureCode } from '@bellfield/contracts';

export type RelayMessageStatus = 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';

export type RelayMessageRecord = {
  id: string;
  shopId: string;
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  status: RelayMessageStatus;
  failureCode: string | null;
  providerMessageId: string | null;
  acceptedAt: Date;
  updatedAt: Date;
};

export type SuppressionReason = 'bounce' | 'complaint' | 'manual';

export type ProviderSendInput = {
  fromName: string;
  to: string;
  replyToEmail?: string;
  subject: string;
  bodyText: string;
  attachment: {
    filename: string;
    contentType: 'application/pdf';
    bytes: Buffer;
  };
  idempotencyKey: string;
};

export type ProviderSendResult =
  | { kind: 'sent'; providerMessageId?: string }
  | { kind: 'failed'; code: RelaySendFailureCode; retryable: boolean; message: string };

export interface EmailSendAdapter {
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

export type ShopReputationCounts = {
  attempted: number;
  hardFailures: number;
};

export interface RelayMessagesStore {
  findByIdempotencyKey(shopId: string, idempotencyKey: string): Promise<RelayMessageRecord | null>;
  findByIdForShop(messageId: string, shopId: string): Promise<RelayMessageRecord | null>;
  findByProviderMessageId(providerMessageId: string): Promise<RelayMessageRecord | null>;
  recordOutcome(input: {
    id: string;
    shopId: string;
    idempotencyKey: string;
    recipientEmail: string;
    subject: string;
    status: 'sent' | 'failed';
    failureCode: string | null;
    providerMessageId: string | null;
    acceptedAt: Date;
  }): Promise<RelayMessageRecord>;
  applyDeliveryEvent(input: {
    providerMessageId: string;
    status: 'delivered' | 'bounced' | 'complained';
    occurredAt: Date;
  }): Promise<boolean>;
  countSendsSince(shopId: string, since: Date): Promise<number>;
  isRecipientSuppressed(shopId: string, email: string): Promise<boolean>;
  addSuppression(input: {
    shopId: string;
    email: string;
    reason: SuppressionReason;
    occurredAt: Date;
  }): Promise<void>;
  getReputationCounts(shopId: string, since: Date): Promise<ShopReputationCounts>;
}
