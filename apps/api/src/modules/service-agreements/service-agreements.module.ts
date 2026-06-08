import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { ServiceAgreementsController } from './service-agreements.controller';
import { ServiceAgreementsRepository } from './service-agreements.repository';
import { ServiceAgreementsService } from './service-agreements.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [ServiceAgreementsController],
  providers: [ServiceAgreementsRepository, ServiceAgreementsService],
  exports: [ServiceAgreementsService]
})
export class ServiceAgreementsModule {}
