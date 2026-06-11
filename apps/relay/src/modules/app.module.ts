import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DeliveryModule } from './delivery/delivery.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';

@Module({
  imports: [DatabaseModule, HealthModule, IdentityModule, DeliveryModule]
})
export class AppModule {}
