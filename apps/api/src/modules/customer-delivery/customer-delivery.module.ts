import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CustomerDeliveryRepository } from './customer-delivery.repository';
import { CustomerDocumentStorageService } from './customer-document-storage.service';
import { EmailProviderService } from './email-provider.service';
import { EstimatePdfRendererService } from './estimate-pdf-renderer.service';
import { InvoicePdfRendererService } from './invoice-pdf-renderer.service';

@Module({
  imports: [MediaModule],
  providers: [
    CustomerDeliveryRepository,
    CustomerDocumentStorageService,
    EmailProviderService,
    EstimatePdfRendererService,
    InvoicePdfRendererService
  ],
  exports: [
    CustomerDeliveryRepository,
    CustomerDocumentStorageService,
    EmailProviderService,
    EstimatePdfRendererService,
    InvoicePdfRendererService
  ]
})
export class CustomerDeliveryModule {}
