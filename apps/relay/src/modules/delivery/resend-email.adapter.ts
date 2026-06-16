import { Injectable, Logger } from '@nestjs/common';
import { getRelayRuntimeConfig, type RelayRuntimeConfig } from '../../common/config/runtime-config';
import type {
  EmailSendAdapter,
  ProviderSendInput,
  ProviderSendResult,
  RelaySenderIdentity
} from './relay-delivery.types';

const sendFailedMessage = 'The delivery provider did not accept this message.';

/**
 * The relay's provider adapter — the only place in the whole product that
 * holds a provider credential. Ported from the API's interim direct adapter,
 * which Phase 5.2 deletes from installs.
 */
@Injectable()
export class ResendEmailAdapter implements EmailSendAdapter {
  private readonly logger = new Logger(ResendEmailAdapter.name);

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const config = getRelayRuntimeConfig();
    if (!config.resendApiKey) {
      // A missing provider key is a BellField operations outage, not install
      // misconfiguration — report it retryable so installs queue instead of
      // recording a permanent failure.
      this.logger.error('Relay provider key is not configured; reporting unavailable.');
      return {
        kind: 'failed',
        code: 'deliveryUnavailable',
        retryable: true,
        message: 'The delivery provider is temporarily unavailable.'
      };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: formatFrom(input.fromName, fromAddressForSender(config, input.sender)),
        to: [input.to],
        reply_to: input.replyToEmail ? [input.replyToEmail] : undefined,
        subject: input.subject,
        text: input.bodyText,
        // Receipt sends carry no PDF; omit attachments entirely rather than
        // send an empty array.
        attachments: input.attachment
          ? [
              {
                filename: input.attachment.filename,
                content: input.attachment.bytes.toString('base64'),
                content_type: input.attachment.contentType
              }
            ]
          : undefined
      })
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Provider request failed.';
      this.logger.warn(`Relay provider send request failed: ${message}`);
      return {
        failed: {
          kind: 'failed' as const,
          code: 'deliveryUnavailable' as const,
          retryable: true,
          message: sendFailedMessage
        }
      };
    });

    if ('failed' in response) {
      return response.failed;
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      this.logger.warn(
        `Relay provider send returned HTTP ${response.status}: ${body.message ?? 'no response message'}`
      );
      return {
        kind: 'failed',
        code: response.status >= 500 ? 'deliveryUnavailable' : 'deliveryRejected',
        retryable: response.status >= 500,
        message: sendFailedMessage
      };
    }

    return { kind: 'sent', providerMessageId: body.id };
  }
}

function fromAddressForSender(config: RelayRuntimeConfig, sender: RelaySenderIdentity) {
  if (sender === 'invoice') {
    return config.invoiceFromAddress;
  }
  if (sender === 'receipt') {
    return config.receiptFromAddress;
  }
  return config.estimateFromAddress;
}

// The display name lands in a mail header and is shop-edited content, so strip
// control characters and quote/escape characters that could break the header.
export function formatFrom(name: string, email: string): string {
  const safeName = [...name]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  if (!safeName) {
    return email;
  }
  // RFC 5322: display names containing specials (commas in "Acme Heating,
  // LLC", angle brackets, semicolons) must be a quoted-string or the header
  // is malformed. Always quote, escaping backslashes and double quotes.
  const escapedName = safeName.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return `"${escapedName}" <${email}>`;
}
