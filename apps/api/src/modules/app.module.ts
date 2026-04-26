import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthModule } from '../health/health.module';
import { CrmModule } from './crm/crm.module';
import { EquipmentModule } from './equipment/equipment.module';
import { IdentityAccessModule } from './identity-access/identity-access.module';
import { JobsAppointmentsModule } from './jobs-appointments/jobs-appointments.module';

@Module({
  imports: [DatabaseModule, HealthModule, IdentityAccessModule, CrmModule, EquipmentModule, JobsAppointmentsModule]
})
export class AppModule {}
