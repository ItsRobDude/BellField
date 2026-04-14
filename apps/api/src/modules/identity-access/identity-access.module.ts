import { Module } from '@nestjs/common';
import { IdentityAccessController } from './identity-access.controller';
import { IdentityAccessRepository } from './identity-access.repository';
import { IdentityAccessService } from './identity-access.service';

@Module({
  controllers: [IdentityAccessController],
  providers: [IdentityAccessRepository, IdentityAccessService],
  exports: [IdentityAccessService]
})
export class IdentityAccessModule {}
