import { Injectable, Logger } from '@nestjs/common';
import { relayServerInstanceHeader } from '@bellfield/contracts';
import type {
  CompanySettings,
  EstimateEmailDeliveryStatus,
  OutboundMessageFailureCode,
  RelayEntitlementResponse,
  RelaySendEstimateDocumentResponse
} from '@bellfield/contracts';
import { getApiRuntimeConfig, type ApiRelayConfig } from '../../common/config/runtime-config';
import type { EmailProviderSendInput, EmailProviderSendResult } from './customer-delivery.types';

export const bellfieldEstimateEmailFromAddress = 'estimates@bellfield.app';
export const deliveryFailedMessage =
  'BellField estimate email delivery failed. Try again or contact support.';
const safeNeedsSetupMessage =
  'Estimate email is not available on this server. Contact BellField support.';
const safeTemporarilyUnavailableMessage =
  'Estimate email availability could not be confirmed. Contact BellField support.';
const safeQuotaExhaustedMessage =
  'Estimate email has reached its sending limit. Contact BellField support.';
const safeSuspendedMessage = 'Estimate email is paused for this server. Contact BellField support.';

/**
 * Relay client for customer-facing email. Sold installs hold no provider
 * credentials; every send goes through the BellField-hosted delivery relay
 * authenticated by the shop's relay token (docs/delivery-relay-plan.md,
 * docs/relay-token-design.md). The exported contract is unchanged from the
 * interim direct-provider adapter it replaces.
 */
@Injectable()
export class EmailProviderService {
  readonly providerKey = 'relay' as const;
  private readonly logger = new Logger(EmailProviderService.name);

  async sendEstimateEmail(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return {
        kind: 'failed',
        code: 'notConfigured',
        retryable: false,
        message: deliveryFailedMessage
      };
    }

    const response = await fetch(`${relay.baseUrl}/v1/messages/estimate`, {
      method: 'POST',
      headers: relayHeaders(relay, { 'Content-Type': 'application/json' }),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.to,
        fromName: input.fromName,
        replyToEmail: input.replyToEmail,
        subject: input.subject,
        bodyText: input.bodyText,
        document: {
          filename: input.attachment.filename,
          contentType: input.attachment.contentType,
          bytesBase64: input.attachment.bytes.toString('base64')
        },
        acceptance: input.acceptance
      })
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Relay request failed.';
      this.logger.warn(`BellField estimate email delivery request failed: ${message}`);
      return {
        failed: {
          kind: 'failed' as const,
          code: 'deliveryUnavailable' as const,
          retryable: true,
          message: deliveryFailedMessage
        }
      };
    });

    if ('failed' in response) {
      return response.failed;
    }

    if (response.status === 401 || response.status === 403) {
      // Revoked or unaccepted credentials, or a suspended shop. Retrying
      // without BellField support intervention cannot succeed.
      this.logger.warn(
        `BellField delivery relay rejected this server's credentials (HTTP ${response.status}).`
      );
      return {
        kind: 'failed',
        code: 'deliveryRejected',
        retryable: false,
        message: deliveryFailedMessage
      };
    }

    const body = (await response.json().catch(() => ({}))) as RelaySendEstimateDocumentResponse;
    if (!response.ok) {
      this.logger.warn(`BellField delivery relay returned HTTP ${response.status}.`);
      return {
        kind: 'failed',
        code: response.status >= 500 ? 'deliveryUnavailable' : 'deliveryRejected',
        retryable: response.status >= 500,
        message: deliveryFailedMessage
      };
    }

    const result = body.result;
    if (result?.kind === 'sent') {
      // The relay is this install's provider: record the relay message id so
      // delivery-status polling can ask the relay about this exact message.
      // ('unrecorded' marks a relay-side bookkeeping failure — nothing to poll.)
      return {
        kind: 'sent',
        providerMessageId:
          result.relayMessageId && result.relayMessageId !== 'unrecorded'
            ? result.relayMessageId
            : undefined,
        acceptanceLinkId: result.acceptanceLinkId,
        acceptanceUrl: result.acceptanceUrl
      };
    }
    if (result?.kind === 'failed') {
      return {
        kind: 'failed',
        code: mapRelayFailureCode(result.code),
        retryable: result.retryable === true,
        message: deliveryFailedMessage
      };
    }
    this.logger.warn('BellField delivery relay returned an unrecognized send result.');
    return {
      kind: 'failed',
      code: 'unknown',
      retryable: false,
      message: deliveryFailedMessage
    };
  }

  async getEstimateEmailDeliveryStatus(): Promise<EstimateEmailDeliveryStatus> {
    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return {
        configured: false,
        ready: false,
        status: 'needsSetup',
        message: safeNeedsSetupMessage
      };
    }

    try {
      const response = await fetch(`${relay.baseUrl}/v1/entitlement`, {
        headers: relayHeaders(relay),
        signal: AbortSignal.timeout(5_000)
      });
      if (response.status === 401) {
        return {
          configured: true,
          ready: false,
          status: 'needsSetup',
          message: safeNeedsSetupMessage
        };
      }
      if (response.status === 403) {
        return {
          configured: true,
          ready: false,
          status: 'suspended',
          message: safeSuspendedMessage
        };
      }
      if (!response.ok) {
        this.logger.warn(
          `BellField estimate email delivery status check returned HTTP ${response.status}.`
        );
        return deliveryStatusUnavailable();
      }
      const body = (await response.json().catch(() => ({}))) as RelayEntitlementResponse;
      if (body.sendingState === 'ready') {
        return {
          configured: true,
          ready: true,
          status: 'ready',
          message: 'Estimate email is ready.'
        };
      }
      if (body.sendingState === 'quotaExhausted') {
        return {
          configured: true,
          ready: false,
          status: 'quotaExhausted',
          message: safeQuotaExhaustedMessage
        };
      }
      return deliveryStatusUnavailable();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delivery status check failed.';
      this.logger.warn(`BellField estimate email delivery status check failed: ${message}`);
      return deliveryStatusUnavailable();
    }
  }
}

export function buildEmailProviderInput(
  settings: Pick<CompanySettings, 'companyName' | 'replyToEmail'>,
  input: Omit<EmailProviderSendInput, 'fromName' | 'replyToEmail'>
): EmailProviderSendInput {
  return {
    ...input,
    // Homeowners are the shop's customers; the shop's name fronts the email.
    fromName: settings.companyName,
    replyToEmail: settings.replyToEmail
  };
}

function relayHeaders(
  relay: ApiRelayConfig,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer ${relay.token}`,
    [relayServerInstanceHeader]: relay.serverInstanceId,
    ...extra
  };
}

function mapRelayFailureCode(code: string | undefined): OutboundMessageFailureCode {
  switch (code) {
    case 'deliveryUnavailable':
      return 'deliveryUnavailable';
    case 'deliveryRejected':
      return 'deliveryRejected';
    case 'recipientUnavailable':
      return 'recipientUnavailable';
    case 'sendingLimitReached':
      return 'sendingLimitReached';
    case 'notConfigured':
      // Relay-side provider config is a BellField ops problem, not install
      // misconfiguration; surface it as unavailability.
      return 'deliveryUnavailable';
    default:
      return 'unknown';
  }
}

function deliveryStatusUnavailable(): EstimateEmailDeliveryStatus {
  return {
    configured: true,
    ready: false,
    status: 'temporarilyUnavailable',
    message: safeTemporarilyUnavailableMessage
  };
}
