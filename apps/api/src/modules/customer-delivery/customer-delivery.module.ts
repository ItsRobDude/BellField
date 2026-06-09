import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { MediaModule } from '../media/media.module';
import { CustomerDeliveryRepository } from './customer-delivery.repository';
import { CustomerDocumentStorageService } from './customer-document-storage.service';
import { EmailProviderService } from './email-provider.service';
import { EstimatePdfRendererService } from './estimate-pdf-renderer.service';

@Module({
  imports: [CompanySettingsModule, MediaModule],
  providers: [
    CustomerDeliveryRepository,
    CustomerDocumentStorageService,
    EmailProviderService,
    EstimatePdfRendererService
  ],
  exports: [
    CustomerDeliveryRepository,
    CustomerDocumentStorageService,
    EmailProviderService,
    EstimatePdfRendererService
  ]
})
export class CustomerDeliveryModule {}
