import { Module } from '@nestjs/common';
import { IdentityAccessController } from './identity-access.controller';
import { IdentityAccessService } from './identity-access.service';

@Module({
  controllers: [IdentityAccessController],
  providers: [IdentityAccessService],
  exports: [IdentityAccessService]
})
export class IdentityAccessModule {}
