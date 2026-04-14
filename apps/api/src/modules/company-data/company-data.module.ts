import { Module } from '@nestjs/common';
import { EquipmentDataRepository } from './equipment-data.repository';
import { EquipmentDataService } from './equipment-data.service';
import { JobsDataRepository } from './jobs-data.repository';
import { JobsDataService } from './jobs-data.service';
import { ReferenceDataRepository } from './reference-data.repository';
import { ReferenceDataService } from './reference-data.service';

@Module({
  providers: [
    ReferenceDataRepository,
    ReferenceDataService,
    EquipmentDataRepository,
    EquipmentDataService,
    JobsDataRepository,
    JobsDataService
  ],
  exports: [ReferenceDataService, EquipmentDataService, JobsDataService]
})
export class CompanyDataModule {}
