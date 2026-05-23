import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { JobQueueController } from './job-queue.controller';
import { JobQueueService } from './job-queue.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [JobQueueController],
  providers: [JobQueueService]
})
export class JobQueueModule {}
