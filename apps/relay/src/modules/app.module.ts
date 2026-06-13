import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AcceptanceModule } from './acceptance/acceptance.module';
import { DeliveryModule } from './delivery/delivery.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PaymentsModule } from './payments/payments.module';
import { ReleasesModule } from './releases/releases.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    IdentityModule,
    AcceptanceModule,
    DeliveryModule,
    PaymentsModule,
    ReleasesModule
  ]
})
export class AppModule {}
