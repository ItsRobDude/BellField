import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingRepository } from './purchasing.repository';
import { PurchasingService } from './purchasing.service';

// Purchase orders + receiving for Milestone 9. DatabaseService comes from the @Global
// DatabaseModule; IdentityAccessModule supplies the permission-aware actor lookup.
// CompanyDataModule supplies EquipmentDataService so receiving creates equipment through
// the canonical equipment path (not bespoke SQL). Reference existence (inventory/customer
// location, job) is checked via raw SQL here rather than importing other repositories.
@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [PurchasingController],
  providers: [PurchasingRepository, PurchasingService],
  exports: [PurchasingRepository]
})
export class PurchasingModule {}
