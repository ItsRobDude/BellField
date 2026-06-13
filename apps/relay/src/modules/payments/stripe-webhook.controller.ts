import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { RelayPaymentsService } from './payments.service';

type RawBodyRequest = {
  rawBody?: Buffer;
};

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly relayPaymentsService: RelayPaymentsService) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') stripeSignature: string | undefined
  ): Promise<{ ok: true }> {
    await this.relayPaymentsService.handleStripeWebhook(
      request.rawBody ?? Buffer.alloc(0),
      stripeSignature
    );
    return { ok: true };
  }
}
