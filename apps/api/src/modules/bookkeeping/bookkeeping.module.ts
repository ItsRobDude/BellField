import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { BookkeepingController } from './bookkeeping.controller';
import { BookkeepingRepository } from './bookkeeping.repository';
import { BookkeepingService } from './bookkeeping.service';

// A read-only cross-job review surface over invoices and payments. DatabaseService comes
// from the @Global DatabaseModule; IdentityAccessModule supplies the permission-aware
// actor lookup. Reads invoice/job/payment tables directly via SQL (no cross-module
// repository imports).
@Module({
  imports: [IdentityAccessModule],
  controllers: [BookkeepingController],
  providers: [BookkeepingRepository, BookkeepingService]
})
export class BookkeepingModule {}
