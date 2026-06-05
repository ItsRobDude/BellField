import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { JobCostingController } from './job-costing.controller';
import { JobCostingRepository } from './job-costing.repository';
import { JobCostingService } from './job-costing.service';

// Job costing (Milestone 9): the non-inventory cost ledger (labor, expense, and non-stock
// material events) plus the costing read model that rolls those up with inventory
// receiveToJob/issueToJob/returnFromJob and the
// finalized snapshot. DatabaseService is global; IdentityAccessModule supplies the
// permission-aware actor lookup. The completion-time snapshot hook lives in company-data's
// job status change and reuses job-cost-rollup-utils from this module.
@Module({
  imports: [IdentityAccessModule],
  controllers: [JobCostingController],
  providers: [JobCostingRepository, JobCostingService]
})
export class JobCostingModule {}
