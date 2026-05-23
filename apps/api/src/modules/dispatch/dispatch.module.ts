import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [DispatchController],
  providers: [DispatchService]
})
export class DispatchModule {}
