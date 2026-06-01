import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import {
  InvoiceController,
  InvoiceLineController,
  JobInvoiceController
} from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

// DatabaseService comes from the @Global DatabaseModule. CompanyDataModule
// supplies JobsDataService (job existence checks); IdentityAccessModule supplies
// the permission-aware actor lookup.
@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [JobInvoiceController, InvoiceLineController, InvoiceController],
  providers: [InvoicesRepository, InvoicesService],
  // Exported so the estimates module can write into the invoice draft during
  // estimate-to-invoice conversion.
  exports: [InvoicesRepository]
})
export class InvoicesModule {}
