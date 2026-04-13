import { Module } from '@nestjs/common';
import { EquipmentDataService } from './equipment-data.service';
import { JobsDataService } from './jobs-data.service';
import { ReferenceDataService } from './reference-data.service';

@Module({
  providers: [ReferenceDataService, EquipmentDataService, JobsDataService],
  exports: [ReferenceDataService, EquipmentDataService, JobsDataService]
})
export class CompanyDataModule {}
