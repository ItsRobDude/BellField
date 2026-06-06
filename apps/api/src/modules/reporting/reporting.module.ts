import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

// Read-only fixed reports over existing invoice/payment/cost/inventory tables. DatabaseService is
// global; IdentityAccessModule supplies the permission-aware actor lookup. Reuses shared calculation
// helpers (open-balance-query, job-cost rollup, inventory on-hand) — no duplicated business math.
@Module({
  imports: [IdentityAccessModule],
  controllers: [ReportingController],
  providers: [ReportingService]
})
export class ReportingModule {}
