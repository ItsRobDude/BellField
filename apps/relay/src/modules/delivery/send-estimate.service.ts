import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  estimateEmailMaxAttachmentBytes,
  type RelayAcceptancePayload,
  type RelaySendFailureCode,
  type RelaySendResult
} from '@bellfield/contracts';
import { log } from '../../common/logger';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import {
  AcceptanceLinksService,
  spliceAcceptanceUrl,
  type PreparedAcceptanceLink
} from '../acceptance/acceptance.service';
import type { EmailSendAdapter, RelayMessagesStore } from './relay-delivery.types';

export const RELAY_MESSAGES_STORE = 'RELAY_MESSAGES_STORE';
export const EMAIL_SEND_ADAPTER = 'EMAIL_SEND_ADAPTER';

export type SendEstimateDocumentInput = {
  idempotencyKey: string;
  recipientEmail: string;
  fromName: string;
  replyToEmail?: string;
  subject: string;
  bodyText: string;
  document: {
    filename: string;
    contentType: 'application/pdf';
    bytesBase64: string;
  };
  acceptance?: RelayAcceptancePayload;
};

const recipientUnavailableMessage = 'This recipient is not currently able to receive email.';
const sendingLimitMessage = 'The monthly sending limit for this shop has been reached.';
const attachmentTooLargeMessage = 'The document attachment is too large to send.';

@Injectable()
export class SendEstimateService {
  constructor(
    @Inject(RELAY_MESSAGES_STORE) private readonly messagesStore: RelayMessagesStore,
    @Inject(EMAIL_SEND_ADAPTER) private readonly emailAdapter: EmailSendAdapter,
    private readonly acceptanceLinksService: AcceptanceLinksService,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  async sendEstimateDocument(
    shop: AuthenticatedRelayShop,
    input: SendEstimateDocumentInput
  ): Promise<RelaySendResult> {
    return await this.messagesStore.withIdempotencyLock(shop.shopId, input.idempotencyKey, () =>
      this.sendEstimateDocumentLocked(shop, input)
    );
  }

  private async sendEstimateDocumentLocked(
    shop: AuthenticatedRelayShop,
    input: SendEstimateDocumentInput
  ): Promise<RelaySendResult> {
    const now = this.now();

    // Replays return the recorded outcome instead of re-sending; the install
    // reuses its idempotency key across worker retries of the same intent.
    // No acceptanceUrl on replays: the plaintext token is never stored, so
    // the URL cannot be reconstructed — the sent email always carries it.
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

    const attachmentBytes = Buffer.from(input.document.bytesBase64, 'base64');
    if (attachmentBytes.length === 0 || attachmentBytes.length > estimateEmailMaxAttachmentBytes) {
      return {
        kind: 'failed',
        code: 'deliveryRejected',
        retryable: false,
        message: attachmentTooLargeMessage
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

    // The link must be minted before the send because its URL goes into the
    // email body. Nothing is persisted yet: a retryable failure below drops
    // the token entirely and the retry mints a fresh one.
    let acceptanceLink: PreparedAcceptanceLink | undefined;
    let bodyText = input.bodyText;
    if (input.acceptance) {
      acceptanceLink = this.acceptanceLinksService.prepareLink();
      bodyText = spliceAcceptanceUrl(bodyText, acceptanceLink.url);
    }

    const providerResult = await this.emailAdapter.send({
      fromName: input.fromName,
      to: input.recipientEmail,
      replyToEmail: input.replyToEmail,
      subject: input.subject,
      bodyText,
      attachment: {
        filename: input.document.filename,
        contentType: input.document.contentType,
        bytes: attachmentBytes
      },
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
        const recordedLink = await this.recordAcceptanceLink(
          shop,
          input.acceptance,
          acceptanceLink,
          record.id,
          now
        );
        return {
          kind: 'sent',
          relayMessageId: record.id,
          providerMessageId: record.providerMessageId ?? undefined,
          acceptanceUrl: recordedLink ? acceptanceLink?.url : undefined,
          acceptanceLinkId: recordedLink ? acceptanceLink?.linkId : undefined
        };
      }
      return providerResult;
    } catch (error) {
      // The provider already has the message; never tell the install it
      // failed. Status polling for this message will come up empty, which is
      // the lesser harm — log loudly for operations.
      log('error', 'Relay failed to record a provider-accepted message.', {
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

  /**
   * Persisted only after the message recorded as sent: a failed message has
   * no email in the world, so it needs no link. When this write fails the
   * email is already out with a now-dead link — the homeowner sees the
   * neutral not-found page and the shop resends. Do not return the link to the
   * install in that case; the office should not display a link BellField failed
   * to persist.
   */
  private async recordAcceptanceLink(
    shop: AuthenticatedRelayShop,
    acceptance: RelayAcceptancePayload | undefined,
    acceptanceLink: PreparedAcceptanceLink | undefined,
    relayMessageId: string,
    now: Date
  ): Promise<boolean> {
    if (!acceptance || !acceptanceLink) {
      return false;
    }
    try {
      await this.acceptanceLinksService.recordMintedLink({
        prepared: acceptanceLink,
        shopId: shop.shopId,
        relayMessageId,
        acceptance,
        now
      });
      return true;
    } catch (error) {
      log('error', 'Relay failed to record an acceptance link for a sent message.', {
        shopId: shop.shopId,
        relayMessageId,
        error
      });
      return false;
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
