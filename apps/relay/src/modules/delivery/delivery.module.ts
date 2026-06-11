import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { DeliveryController } from './delivery.controller';
import { EntitlementService } from './entitlement.service';
import { ProviderWebhookController } from './provider-webhook.controller';
import { ProviderWebhookService, shopSuspenderProvider } from './provider-webhook.service';
import { RelayMessagesRepository } from './relay-messages.repository';
import { ResendEmailAdapter } from './resend-email.adapter';
import {
  EMAIL_SEND_ADAPTER,
  RELAY_MESSAGES_STORE,
  SendEstimateService
} from './send-estimate.service';

@Module({
  imports: [IdentityModule],
  controllers: [DeliveryController, ProviderWebhookController],
  providers: [
    RelayMessagesRepository,
    { provide: RELAY_MESSAGES_STORE, useExisting: RelayMessagesRepository },
    ResendEmailAdapter,
    { provide: EMAIL_SEND_ADAPTER, useExisting: ResendEmailAdapter },
    shopSuspenderProvider,
    SendEstimateService,
    EntitlementService,
    ProviderWebhookService
  ]
})
export class DeliveryModule {}
