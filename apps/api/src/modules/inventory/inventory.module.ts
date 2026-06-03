import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import {
  InventoryItemsController,
  InventoryLedgerController,
  InventoryLocationsController
} from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

// Inventory catalog, stock locations, and the movement ledger (on-hand, adjustments,
// transfers, issue-to-job) for Milestone 9. DatabaseService comes from the @Global
// DatabaseModule; IdentityAccessModule supplies the permission-aware actor lookup.
@Module({
  imports: [IdentityAccessModule],
  controllers: [InventoryItemsController, InventoryLocationsController, InventoryLedgerController],
  providers: [InventoryRepository, InventoryService]
})
export class InventoryModule {}
