import { Module } from '@nestjs/common';
import { EquipmentDataRepository } from './equipment-data.repository';
import { EquipmentDataService } from './equipment-data.service';
import { JobsCommandDataRepository } from './jobs-command-data.repository';
import { JobsDataRepository } from './jobs-data.repository';
import { JobsDataService } from './jobs-data.service';
import { JobsMediaDataRepository } from './jobs-media-data.repository';
import { JobsReadDataRepository } from './jobs-read-data.repository';
import { JobsRegisterDataRepository } from './jobs-register-data.repository';
import { ReferenceDataRepository } from './reference-data.repository';
import { ReferenceDataService } from './reference-data.service';
import { ReferenceReadDataRepository } from './reference-read-data.repository';

@Module({
  providers: [
    ReferenceReadDataRepository,
    ReferenceDataRepository,
    ReferenceDataService,
    EquipmentDataRepository,
    EquipmentDataService,
    JobsRegisterDataRepository,
    JobsMediaDataRepository,
    JobsReadDataRepository,
    JobsCommandDataRepository,
    JobsDataRepository,
    JobsDataService
  ],
  exports: [ReferenceDataService, EquipmentDataService, JobsDataService]
})
export class CompanyDataModule {}
