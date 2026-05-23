import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthModule } from '../health/health.module';
import { CrmModule } from './crm/crm.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { EquipmentModule } from './equipment/equipment.module';
import { IdentityAccessModule } from './identity-access/identity-access.module';
import { JobDetailModule } from './job-detail/job-detail.module';
import { JobQueueModule } from './job-queue/job-queue.module';
import { JobsAppointmentsModule } from './jobs-appointments/jobs-appointments.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    IdentityAccessModule,
    CrmModule,
    DispatchModule,
    EquipmentModule,
    JobDetailModule,
    JobQueueModule,
    JobsAppointmentsModule,
    MediaModule
  ]
})
export class AppModule {}
