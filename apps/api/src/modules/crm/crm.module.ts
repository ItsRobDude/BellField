import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [CrmController],
  providers: [CrmService]
})
export class CrmModule {}
