import { Module } from '@nestjs/common';
import { CompanyDataService } from './company-data.service';

@Module({
  providers: [CompanyDataService],
  exports: [CompanyDataService]
})
export class CompanyDataModule {}
