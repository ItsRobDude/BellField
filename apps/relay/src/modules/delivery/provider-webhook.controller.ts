import { Body, Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import { log } from '../../common/logger';
import { ProviderWebhookService, type ProviderWebhookEvent } from './provider-webhook.service';
import { verifyWebhookSignature } from './webhook-signature.util';

type RawBodyRequest = {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
};

@Controller('webhooks')
export class ProviderWebhookController {
  constructor(private readonly providerWebhookService: ProviderWebhookService) {}

  @Post('resend')
  @HttpCode(200)
  async handleResendWebhook(
    @Req() request: RawBodyRequest,
    @Body() body: ProviderWebhookEvent
  ): Promise<{ received: true }> {
    const secret = getRelayRuntimeConfig().webhookSigningSecret;
    if (!secret) {
      log('error', 'Provider webhook received but no signing secret is configured.');
      throw new UnauthorizedException('Webhook signature could not be verified.');
    }

    const verified = verifyWebhookSignature({
      secret,
      headers: {
        id: headerValue(request.headers['svix-id']),
        timestamp: headerValue(request.headers['svix-timestamp']),
        signature: headerValue(request.headers['svix-signature'])
      },
      rawBody: request.rawBody ?? Buffer.alloc(0),
      now: new Date()
    });
    if (!verified) {
      throw new UnauthorizedException('Webhook signature could not be verified.');
    }

    await this.providerWebhookService.handleEvent(body);
    return { received: true };
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
