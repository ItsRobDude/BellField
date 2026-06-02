import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthModule } from '../health/health.module';
import { BookkeepingModule } from './bookkeeping/bookkeeping.module';
import { CrmModule } from './crm/crm.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { EquipmentModule } from './equipment/equipment.module';
import { EstimatesModule } from './estimates/estimates.module';
import { IdentityAccessModule } from './identity-access/identity-access.module';
import { InvoicesModule } from './invoices/invoices.module';
import { JobDetailModule } from './job-detail/job-detail.module';
import { JobQueueModule } from './job-queue/job-queue.module';
import { JobsAppointmentsModule } from './jobs-appointments/jobs-appointments.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    IdentityAccessModule,
    BookkeepingModule,
    CrmModule,
    DispatchModule,
    EquipmentModule,
    EstimatesModule,
    InvoicesModule,
    JobDetailModule,
    JobQueueModule,
    JobsAppointmentsModule,
    MediaModule
  ]
})
export class AppModule {}
