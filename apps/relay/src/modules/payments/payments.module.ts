import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PaymentsController } from './payments.controller';
import { RelayPaymentsRepository } from './relay-payments.repository';
import { RELAY_PAYMENTS_STORE, RelayPaymentsService } from './payments.service';
import { PaymentReturnController } from './payment-return.controller';
import { StripePaymentsService } from './stripe-payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [IdentityModule],
  controllers: [PaymentsController, StripeWebhookController, PaymentReturnController],
  providers: [
    RelayPaymentsRepository,
    { provide: RELAY_PAYMENTS_STORE, useExisting: RelayPaymentsRepository },
    StripePaymentsService,
    RelayPaymentsService
  ],
  exports: [RelayPaymentsService]
})
export class PaymentsModule {}
