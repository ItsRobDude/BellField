import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { JobDetailController } from './job-detail.controller';
import { JobDetailService } from './job-detail.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [JobDetailController],
  providers: [JobDetailService]
})
export class JobDetailModule {}
