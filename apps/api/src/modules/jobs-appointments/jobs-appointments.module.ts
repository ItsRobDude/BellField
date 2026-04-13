import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { JobsAppointmentsController } from './jobs-appointments.controller';
import { JobsAppointmentsService } from './jobs-appointments.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [JobsAppointmentsController],
  providers: [JobsAppointmentsService]
})
export class JobsAppointmentsModule {}
