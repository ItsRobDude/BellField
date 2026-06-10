import { Injectable, Logger } from '@nestjs/common';
import type { CompanySettings, EstimateEmailDeliveryStatus } from '@bellfield/contracts';
import { getApiRuntimeConfig } from '../../common/config/runtime-config';
import type { EmailProviderSendInput, EmailProviderSendResult } from './customer-delivery.types';

export const bellfieldEstimateEmailFromAddress = 'estimates@bellfield.app';
const bellfieldEstimateEmailFromName = 'BellField Estimates';
export const deliveryNotConfiguredMessage = 'BellField estimate email delivery is not configured.';
export const deliveryFailedMessage =
  'BellField estimate email delivery failed. Try again or contact support.';
const safeNeedsSetupMessage =
  'Estimate email is not available on this server. Contact BellField support.';
const safeTemporarilyUnavailableMessage =
  'Estimate email availability could not be confirmed. Contact BellField support.';

type ResendDomainSummary = {
  id?: string;
  name?: string;
  status?: string;
  capabilities?: {
    sending?: string;
  };
};

@Injectable()
export class EmailProviderService {
  private readonly logger = new Logger(EmailProviderService.name);

  async sendEstimateEmail(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const apiKey = getApiRuntimeConfig().estimateEmailResendApiKey;
    if (!apiKey) {
      return { kind: 'notConfigured', message: deliveryNotConfiguredMessage };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: formatFrom(bellfieldEstimateEmailFromName, bellfieldEstimateEmailFromAddress),
        to: [input.to],
        reply_to: input.replyToEmail ? [input.replyToEmail] : undefined,
        subject: input.subject,
        text: input.bodyText,
        attachments: [
          {
            filename: input.attachment.filename,
            content: input.attachment.bytes.toString('base64'),
            content_type: input.attachment.contentType
          }
        ]
      })
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Email provider request failed.';
      this.logger.warn(`BellField estimate email delivery request failed: ${message}`);
      return { error: deliveryFailedMessage };
    });

    if ('error' in response) {
      return { kind: 'error', message: response.error };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      this.logger.warn(
        `BellField estimate email delivery returned HTTP ${response.status}: ${body.message ?? 'no response message'}`
      );
      return {
        kind: 'error',
        message: deliveryFailedMessage
      };
    }

    return { kind: 'sent', providerMessageId: body.id };
  }

  async getEstimateEmailDeliveryStatus(): Promise<EstimateEmailDeliveryStatus> {
    const apiKey = getApiRuntimeConfig().estimateEmailResendApiKey;
    if (!apiKey) {
      return {
        configured: false,
        ready: false,
        status: 'needsSetup',
        message: safeNeedsSetupMessage
      };
    }

    const sendingDomain = bellfieldEstimateEmailFromAddress.split('@')[1];
    try {
      const response = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) {
        this.logger.warn(
          `BellField estimate email delivery status check returned HTTP ${response.status}.`
        );
        return deliveryStatusUnavailable();
      }
      const body = (await response.json().catch(() => ({}))) as {
        data?: ResendDomainSummary[];
      };
      const domain = body.data?.find((item) => item.name === sendingDomain);
      if (!domain) {
        return deliveryStatusNeedsSetup();
      }
      const sendingEnabled = domain.capabilities?.sending !== 'disabled';
      const verifiedForSending =
        (domain.status === 'verified' || domain.status === 'partially_verified') && sendingEnabled;
      return verifiedForSending
        ? {
            configured: true,
            ready: true,
            status: 'ready',
            message: 'Estimate email is ready.'
          }
        : deliveryStatusNeedsSetup();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delivery status check failed.';
      this.logger.warn(`BellField estimate email delivery status check failed: ${message}`);
      return deliveryStatusUnavailable();
    }
  }
}

export function buildEmailProviderInput(
  settings: Pick<CompanySettings, 'replyToEmail'>,
  input: Omit<EmailProviderSendInput, 'replyToEmail'>
): EmailProviderSendInput {
  return {
    ...input,
    replyToEmail: settings.replyToEmail
  };
}

function formatFrom(name: string, email: string): string {
  const safeName = name.replaceAll('"', '').trim();
  return safeName ? `${safeName} <${email}>` : email;
}

function deliveryStatusNeedsSetup(): EstimateEmailDeliveryStatus {
  return {
    configured: true,
    ready: false,
    status: 'needsSetup',
    message: safeNeedsSetupMessage
  };
}

function deliveryStatusUnavailable(): EstimateEmailDeliveryStatus {
  return {
    configured: true,
    ready: false,
    status: 'temporarilyUnavailable',
    message: safeTemporarilyUnavailableMessage
  };
}
