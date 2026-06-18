import { Module } from '@nestjs/common';
import { CustomerDeliveryModule } from '../customer-delivery/customer-delivery.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { CompanySettingsController } from './company-settings.controller';
import { CompanySettingsRepository } from './company-settings.repository';
import { CompanySettingsService } from './company-settings.service';
import { OnlinePaymentsSetupService } from './online-payments-setup.service';

@Module({
  imports: [CustomerDeliveryModule, IdentityAccessModule],
  controllers: [CompanySettingsController],
  providers: [CompanySettingsRepository, CompanySettingsService, OnlinePaymentsSetupService],
  exports: [CompanySettingsRepository, CompanySettingsService]
})
export class CompanySettingsModule {}
