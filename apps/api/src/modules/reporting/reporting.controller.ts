import { Controller, Get, Headers } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { ReportingService } from './reporting.service';

@Controller('operations/reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('ar-open-balances')
  async getArOpenBalances(@Headers('authorization') auth: string | undefined) {
    return this.reportingService.getArOpenBalances(getBearerToken(auth));
  }
}
