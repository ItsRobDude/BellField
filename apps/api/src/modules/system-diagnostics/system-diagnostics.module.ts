import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { MediaModule } from '../media/media.module';
import { SystemDiagnosticsController } from './system-diagnostics.controller';
import { SystemDiagnosticsService } from './system-diagnostics.service';

@Module({
  imports: [IdentityAccessModule, MediaModule],
  controllers: [SystemDiagnosticsController],
  providers: [SystemDiagnosticsService],
  exports: [SystemDiagnosticsService]
})
export class SystemDiagnosticsModule {}
