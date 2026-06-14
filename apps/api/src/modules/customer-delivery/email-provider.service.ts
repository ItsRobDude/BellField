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
export const invoiceDeliveryFailedMessage =
  'BellField invoice email delivery failed. Try again or contact support.';

type CustomerEmailKind = 'estimate' | 'invoice';

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
    return this.sendCustomerDocumentEmail('estimate', input);
  }

  async sendInvoiceEmail(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    return this.sendCustomerDocumentEmail('invoice', input);
  }

  private async sendCustomerDocumentEmail(
    kind: CustomerEmailKind,
    input: EmailProviderSendInput
  ): Promise<EmailProviderSendResult> {
    const failedMessage = kind === 'invoice' ? invoiceDeliveryFailedMessage : deliveryFailedMessage;
    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return {
        kind: 'failed',
        code: 'notConfigured',
        retryable: false,
        message: failedMessage
      };
    }

    // Deliberate debt: the relay send payload is already document-generic, but
    // the v1 relay route is still estimate-branded. Keep the route stable for
    // this invoice slice and rename it in a later relay API cleanup.
    const response = await fetch(`${relay.baseUrl}/v1/messages/estimate`, {
      method: 'POST',
      headers: relayHeaders(relay, { 'Content-Type': 'application/json' }),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        documentType: kind,
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
      this.logger.warn(`BellField ${kind} email delivery request failed: ${message}`);
      return {
        failed: {
          kind: 'failed' as const,
          code: 'deliveryUnavailable' as const,
          retryable: true,
          message: failedMessage
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
        message: failedMessage
      };
    }

    const body = (await response.json().catch(() => ({}))) as RelaySendEstimateDocumentResponse;
    if (!response.ok) {
      this.logger.warn(`BellField delivery relay returned HTTP ${response.status}.`);
      return {
        kind: 'failed',
        code: response.status >= 500 ? 'deliveryUnavailable' : 'deliveryRejected',
        retryable: response.status >= 500,
        message: failedMessage
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
        message: failedMessage
      };
    }
    this.logger.warn('BellField delivery relay returned an unrecognized send result.');
    return {
      kind: 'failed',
      code: 'unknown',
      retryable: false,
      message: failedMessage
    };
  }

  async getEstimateEmailDeliveryStatus(): Promise<EstimateEmailDeliveryStatus> {
    return this.getCustomerEmailDeliveryStatus('estimate');
  }

  async getInvoiceEmailDeliveryStatus(): Promise<EstimateEmailDeliveryStatus> {
    return this.getCustomerEmailDeliveryStatus('invoice');
  }

  private async getCustomerEmailDeliveryStatus(
    kind: CustomerEmailKind
  ): Promise<EstimateEmailDeliveryStatus> {
    const relay = getApiRuntimeConfig().relay;
    const labels = deliveryStatusLabels(kind);
    if (!relay) {
      return {
        configured: false,
        ready: false,
        status: 'needsSetup',
        message: labels.needsSetup
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
          message: labels.needsSetup
        };
      }
      if (response.status === 403) {
        return {
          configured: true,
          ready: false,
          status: 'suspended',
          message: labels.suspended
        };
      }
      if (!response.ok) {
        this.logger.warn(
          `BellField ${kind} email delivery status check returned HTTP ${response.status}.`
        );
        return deliveryStatusUnavailable(kind);
      }
      const body = (await response.json().catch(() => ({}))) as RelayEntitlementResponse;
      if (body.sendingState === 'ready') {
        return {
          configured: true,
          ready: true,
          status: 'ready',
          message: labels.ready
        };
      }
      if (body.sendingState === 'quotaExhausted') {
        return {
          configured: true,
          ready: false,
          status: 'quotaExhausted',
          message: labels.quotaExhausted
        };
      }
      return deliveryStatusUnavailable(kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delivery status check failed.';
      this.logger.warn(`BellField ${kind} email delivery status check failed: ${message}`);
      return deliveryStatusUnavailable(kind);
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

function deliveryStatusUnavailable(kind: CustomerEmailKind): EstimateEmailDeliveryStatus {
  const labels = deliveryStatusLabels(kind);
  return {
    configured: true,
    ready: false,
    status: 'temporarilyUnavailable',
    message: labels.temporarilyUnavailable
  };
}

function deliveryStatusLabels(kind: CustomerEmailKind): {
  needsSetup: string;
  temporarilyUnavailable: string;
  quotaExhausted: string;
  suspended: string;
  ready: string;
} {
  const label = kind === 'invoice' ? 'Invoice email' : 'Estimate email';
  return {
    needsSetup: `${label} is not available on this server. Contact BellField support.`,
    temporarilyUnavailable: `${label} availability could not be confirmed. Contact BellField support.`,
    quotaExhausted: `${label} has reached its sending limit. Contact BellField support.`,
    suspended: `${label} is paused for this server. Contact BellField support.`,
    ready: `${label} is ready.`
  };
}
