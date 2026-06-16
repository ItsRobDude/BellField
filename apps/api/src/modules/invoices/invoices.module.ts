import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { CustomerDeliveryModule } from '../customer-delivery/customer-delivery.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import {
  InvoiceController,
  InvoiceLineController,
  JobInvoiceController
} from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';
import { InvoiceDeliveryService } from './invoice-delivery.service';
import {
  InvoicePaymentsController,
  JobPaymentLinksController,
  JobPaymentsController,
  PaymentController
} from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { OnlinePaymentLinkService } from './online-payment-link.service';
import { OnlinePaymentsRepository } from './online-payments.repository';
import { OnlineRefundService } from './online-refund.service';
import { OnlineRefundsRepository } from './online-refunds.repository';

// DatabaseService comes from the @Global DatabaseModule. CompanyDataModule
// supplies JobsDataService (job existence checks); IdentityAccessModule supplies
// the permission-aware actor lookup. Payments live in this module because they are
// tightly coupled to invoices (recorded against a posted invoice) and feed the job
// invoice balance.
@Module({
  imports: [CompanyDataModule, CompanySettingsModule, CustomerDeliveryModule, IdentityAccessModule],
  controllers: [
    JobInvoiceController,
    InvoiceLineController,
    InvoiceController,
    JobPaymentsController,
    JobPaymentLinksController,
    InvoicePaymentsController,
    PaymentController
  ],
  providers: [
    InvoicesRepository,
    InvoicesService,
    InvoiceDeliveryService,
    PaymentsRepository,
    PaymentsService,
    OnlinePaymentsRepository,
    OnlinePaymentLinkService,
    OnlineRefundsRepository,
    OnlineRefundService
  ],
  // Exported so the estimates module can write into the invoice draft during
  // estimate-to-invoice conversion.
  exports: [InvoicesRepository]
})
export class InvoicesModule {}
