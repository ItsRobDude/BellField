import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { CustomerDeliveryModule } from '../customer-delivery/customer-delivery.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EstimatesController, JobEstimatesController } from './estimates.controller';
import { EstimatesRepository } from './estimates.repository';
import { EstimatesService } from './estimates.service';

// DatabaseService is provided by the @Global DatabaseModule, so it does not need
// to be imported here. CompanyDataModule supplies JobsDataService (job existence
// checks); IdentityAccessModule supplies the permission-aware actor lookup;
// InvoicesModule exports InvoicesRepository for estimate-to-invoice conversion.
@Module({
  imports: [
    CompanyDataModule,
    CompanySettingsModule,
    CustomerDeliveryModule,
    IdentityAccessModule,
    InvoicesModule
  ],
  controllers: [JobEstimatesController, EstimatesController],
  providers: [EstimatesRepository, EstimatesService]
})
export class EstimatesModule {}
