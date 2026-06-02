import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import {
  InventoryItemsController,
  InventoryLedgerController,
  InventoryLocationsController
} from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

// Catalog + stock-location identity for Milestone 9. DatabaseService comes from the
// @Global DatabaseModule; IdentityAccessModule supplies the permission-aware actor
// lookup. The movement ledger that gives these on-hand quantities is a later slice.
@Module({
  imports: [IdentityAccessModule],
  controllers: [InventoryItemsController, InventoryLocationsController, InventoryLedgerController],
  providers: [InventoryRepository, InventoryService],
  exports: [InventoryRepository]
})
export class InventoryModule {}
