import { Controller, Get, Headers } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { SystemDiagnosticsService } from './system-diagnostics.service';

@Controller('system')
export class SystemDiagnosticsController {
  constructor(private readonly systemDiagnosticsService: SystemDiagnosticsService) {}

  @Get('diagnostics')
  async getDiagnostics(@Headers('authorization') auth: string | undefined) {
    return this.systemDiagnosticsService.getDiagnostics(getBearerToken(auth));
  }
}
