import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { MediaModule } from '../media/media.module';
import { SystemDiagnosticsModule } from '../system-diagnostics/system-diagnostics.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [IdentityAccessModule, MediaModule, SystemDiagnosticsModule],
  controllers: [SupportController],
  providers: [SupportService]
})
export class SupportModule {}
