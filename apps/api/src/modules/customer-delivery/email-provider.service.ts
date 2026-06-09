import { Injectable } from '@nestjs/common';
import type { CompanySettings } from '@bellfield/contracts';
import { CompanySettingsRepository } from '../company-settings/company-settings.repository';
import { SecretCryptoService } from '../company-settings/secret-crypto.service';
import type { EmailProviderSendInput, EmailProviderSendResult } from './customer-delivery.types';

type ResendResponseBody = {
  id?: string;
  message?: string;
  name?: string;
};

@Injectable()
export class EmailProviderService {
  constructor(
    private readonly companySettingsRepository: CompanySettingsRepository,
    private readonly secretCryptoService: SecretCryptoService
  ) {}

  async sendEstimateEmail(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const secret = await this.companySettingsRepository.getEmailProviderSecret('resend');
    if (!secret) {
      return { kind: 'notConfigured', message: 'Resend is not configured.' };
    }

    const apiKey = this.secretCryptoService.decryptSecret(secret);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: formatFrom(input.fromName, input.fromEmail),
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
      return { error: message };
    });

    if ('error' in response) {
      return { kind: 'error', message: response.error };
    }

    const body = (await response.json().catch(() => ({}))) as ResendResponseBody;
    if (!response.ok) {
      return {
        kind: 'error',
        message: body.message ?? body.name ?? `Resend returned HTTP ${response.status}.`
      };
    }

    return { kind: 'sent', providerMessageId: body.id };
  }
}

export function buildEmailProviderInput(
  settings: CompanySettings,
  input: Omit<EmailProviderSendInput, 'fromEmail' | 'fromName' | 'replyToEmail'>
): EmailProviderSendInput {
  return {
    ...input,
    fromEmail: settings.customerFacingFromEmail,
    fromName: settings.customerFacingSenderName,
    replyToEmail: settings.replyToEmail
  };
}

function formatFrom(name: string, email: string): string {
  const safeName = name.replaceAll('"', '').trim();
  return safeName ? `${safeName} <${email}>` : email;
}
