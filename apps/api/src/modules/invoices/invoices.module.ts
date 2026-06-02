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
import {
  InvoicePaymentsController,
  JobPaymentsController,
  PaymentController
} from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

// DatabaseService comes from the @Global DatabaseModule. CompanyDataModule
// supplies JobsDataService (job existence checks); IdentityAccessModule supplies
// the permission-aware actor lookup. Payments live in this module because they are
// tightly coupled to invoices (recorded against a posted invoice) and feed the job
// invoice balance.
@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [
    JobInvoiceController,
    InvoiceLineController,
    InvoiceController,
    JobPaymentsController,
    InvoicePaymentsController,
    PaymentController
  ],
  providers: [InvoicesRepository, InvoicesService, PaymentsRepository, PaymentsService],
  // Exported so the estimates module can write into the invoice draft during
  // estimate-to-invoice conversion.
  exports: [InvoicesRepository]
})
export class InvoicesModule {}
