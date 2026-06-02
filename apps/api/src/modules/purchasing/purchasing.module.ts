import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingRepository } from './purchasing.repository';
import { PurchasingService } from './purchasing.service';

// Purchase orders for Milestone 9. DatabaseService comes from the @Global
// DatabaseModule; IdentityAccessModule supplies the permission-aware actor lookup.
// Reference existence (inventory location / customer location / job) is checked via
// raw SQL here rather than importing other modules' repositories. Receiving (which
// turns a PO into inventory movements + equipment) is a later slice.
@Module({
  imports: [IdentityAccessModule],
  controllers: [PurchasingController],
  providers: [PurchasingRepository, PurchasingService],
  exports: [PurchasingRepository]
})
export class PurchasingModule {}
