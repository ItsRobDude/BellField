import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PaymentsController } from './payments.controller';
import { RelayPaymentsRepository } from './relay-payments.repository';
import { RELAY_PAYMENTS_STORE, RelayPaymentsService } from './payments.service';
import { PaymentReturnController } from './payment-return.controller';
import { PaymentSetupReturnController } from './payment-setup-return.controller';
import { RELAY_PAYMENT_SETUP_STORE, RelayPaymentSetupService } from './payment-setup.service';
import { StripePaymentsService } from './stripe-payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [IdentityModule],
  controllers: [
    PaymentsController,
    StripeWebhookController,
    PaymentReturnController,
    PaymentSetupReturnController
  ],
  providers: [
    RelayPaymentsRepository,
    { provide: RELAY_PAYMENTS_STORE, useExisting: RelayPaymentsRepository },
    { provide: RELAY_PAYMENT_SETUP_STORE, useExisting: RelayPaymentsRepository },
    StripePaymentsService,
    RelayPaymentsService,
    RelayPaymentSetupService
  ],
  exports: [RelayPaymentsService, RelayPaymentSetupService]
})
export class PaymentsModule {}
