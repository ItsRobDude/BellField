import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { ServiceAgreementsModule } from '../service-agreements/service-agreements.module';
import { JobsAppointmentsController } from './jobs-appointments.controller';
import { JobsAppointmentsService } from './jobs-appointments.service';

@Module({
  imports: [CatalogModule, CompanyDataModule, IdentityAccessModule, ServiceAgreementsModule],
  controllers: [JobsAppointmentsController],
  providers: [JobsAppointmentsService]
})
export class JobsAppointmentsModule {}
