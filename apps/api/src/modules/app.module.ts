import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { IdentityAccessModule } from './identity-access/identity-access.module';

@Module({
  imports: [HealthModule, IdentityAccessModule]
})
export class AppModule {}
