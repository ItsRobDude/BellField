import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { JobCostingController } from './job-costing.controller';
import { JobCostingRepository } from './job-costing.repository';
import { JobCostingService } from './job-costing.service';

// Non-inventory job-cost ledger (Milestone 9): labor + expense events. DatabaseService is
// global; IdentityAccessModule supplies the permission-aware actor lookup. The B6 read
// model that rolls these up with inventory movements is a later slice.
@Module({
  imports: [IdentityAccessModule],
  controllers: [JobCostingController],
  providers: [JobCostingRepository, JobCostingService],
  exports: [JobCostingRepository]
})
export class JobCostingModule {}
