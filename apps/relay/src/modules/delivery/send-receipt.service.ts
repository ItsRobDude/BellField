import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type RelayReceiptMessageType,
  type RelaySendFailureCode,
  type RelaySendResult
} from '@bellfield/contracts';
import { log } from '../../common/logger';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import { EMAIL_SEND_ADAPTER, RELAY_MESSAGES_STORE } from './send-estimate.service';
import type { EmailSendAdapter, RelayMessagesStore } from './relay-delivery.types';

export type SendReceiptMessageInput = {
  idempotencyKey: string;
  messageType: RelayReceiptMessageType;
  recipientEmail: string;
  fromName: string;
  replyToEmail?: string;
  subject: string;
  bodyText: string;
};

const recipientUnavailableMessage = 'This recipient is not currently able to receive email.';
const sendingLimitMessage = 'The monthly sending limit for this shop has been reached.';

/**
 * Sends a customer-facing payment/refund receipt. Receipts reuse the shared
 * message store (quota, suppression, idempotency, status) but carry no PDF and
 * no acceptance link, and front the billing sender identity. Kept separate from
 * SendEstimateService so the document send path stays document-shaped.
 */
@Injectable()
export class SendReceiptService {
  constructor(
    @Inject(RELAY_MESSAGES_STORE) private readonly messagesStore: RelayMessagesStore,
    @Inject(EMAIL_SEND_ADAPTER) private readonly emailAdapter: EmailSendAdapter,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  async sendReceiptMessage(
    shop: AuthenticatedRelayShop,
    input: SendReceiptMessageInput
  ): Promise<RelaySendResult> {
    return await this.messagesStore.withIdempotencyLock(shop.shopId, input.idempotencyKey, () =>
      this.sendReceiptMessageLocked(shop, input)
    );
  }

  private async sendReceiptMessageLocked(
    shop: AuthenticatedRelayShop,
    input: SendReceiptMessageInput
  ): Promise<RelaySendResult> {
    const now = this.now();

    const replayed = await this.messagesStore.findByIdempotencyKey(
      shop.shopId,
      input.idempotencyKey
    );
    if (replayed) {
      if (replayed.status === 'failed') {
        return {
          kind: 'failed',
          code: isRelaySendFailureCode(replayed.failureCode)
            ? replayed.failureCode
            : 'deliveryRejected',
          retryable: false,
          message: 'This message was already attempted and did not send.'
        };
      }
      return {
        kind: 'sent',
        relayMessageId: replayed.id,
        providerMessageId: replayed.providerMessageId ?? undefined
      };
    }

    const monthStart = utcMonthStart(now);
    const sentThisMonth = await this.messagesStore.countSendsSince(shop.shopId, monthStart);
    if (sentThisMonth >= shop.monthlySendQuota) {
      return {
        kind: 'failed',
        code: 'sendingLimitReached',
        retryable: false,
        message: sendingLimitMessage
      };
    }

    const suppressed = await this.messagesStore.isRecipientSuppressed(
      shop.shopId,
      input.recipientEmail
    );
    if (suppressed) {
      return {
        kind: 'failed',
        code: 'recipientUnavailable',
        retryable: false,
        message: recipientUnavailableMessage
      };
    }

    const providerResult = await this.emailAdapter.send({
      sender: 'receipt',
      fromName: input.fromName,
      to: input.recipientEmail,
      replyToEmail: input.replyToEmail,
      subject: input.subject,
      bodyText: input.bodyText,
      // Namespaced per shop so two shops can never collide provider-side.
      idempotencyKey: `relay/${shop.shopId}/${input.idempotencyKey}`
    });

    // Retryable failures are deliberately not recorded: the install retries
    // with the same key later and must get a fresh attempt, not a replay.
    if (providerResult.kind === 'failed' && providerResult.retryable) {
      return providerResult;
    }

    try {
      const record = await this.messagesStore.recordOutcome({
        id: randomUUID(),
        shopId: shop.shopId,
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        status: providerResult.kind === 'sent' ? 'sent' : 'failed',
        failureCode: providerResult.kind === 'failed' ? providerResult.code : null,
        providerMessageId:
          providerResult.kind === 'sent' ? (providerResult.providerMessageId ?? null) : null,
        acceptedAt: now
      });
      if (providerResult.kind === 'sent') {
        return {
          kind: 'sent',
          relayMessageId: record.id,
          providerMessageId: record.providerMessageId ?? undefined
        };
      }
      return providerResult;
    } catch (error) {
      // The provider already has the message; never tell the install it failed.
      // Status polling will come up empty, the lesser harm — log for operations.
      log('error', 'Relay failed to record a provider-accepted receipt message.', {
        shopId: shop.shopId,
        error
      });
      if (providerResult.kind === 'sent') {
        return {
          kind: 'sent',
          relayMessageId: 'unrecorded',
          providerMessageId: providerResult.providerMessageId
        };
      }
      return providerResult;
    }
  }
}

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const relaySendFailureCodes: readonly RelaySendFailureCode[] = [
  'notConfigured',
  'deliveryUnavailable',
  'deliveryRejected',
  'recipientUnavailable',
  'sendingLimitReached',
  'unknown'
];

function isRelaySendFailureCode(value: string | null): value is RelaySendFailureCode {
  return value !== null && (relaySendFailureCodes as readonly string[]).includes(value);
}
