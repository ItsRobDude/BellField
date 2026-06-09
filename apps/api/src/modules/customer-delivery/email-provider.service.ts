import { Injectable, Logger } from '@nestjs/common';
import type { CompanySettings } from '@bellfield/contracts';
import { getApiRuntimeConfig } from '../../common/config/runtime-config';
import type { EmailProviderSendInput, EmailProviderSendResult } from './customer-delivery.types';

export const bellfieldEstimateEmailFromAddress = 'estimates@bellfield.app';
const bellfieldEstimateEmailFromName = 'BellField Estimates';
const deliveryNotConfiguredMessage = 'BellField estimate email delivery is not configured.';
const deliveryFailedMessage =
  'BellField estimate email delivery failed. Try again or contact support.';

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
