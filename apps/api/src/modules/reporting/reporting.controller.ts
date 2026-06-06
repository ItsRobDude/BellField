import { Controller, Get, Headers, Res } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { ReportingService } from './reporting.service';

// Minimal response shape to set the download headers without taking on @types/express
// (mirrors SupportController / MediaController).
type MinimalResponse = { setHeader: (name: string, value: string) => void };

@Controller('operations/reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('ar-open-balances')
  async getArOpenBalances(@Headers('authorization') auth: string | undefined) {
    return this.reportingService.getArOpenBalances(getBearerToken(auth));
  }

  @Get('ar-open-balances/export')
  async exportArOpenBalances(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportArOpenBalances(
      getBearerToken(auth)
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('job-profitability')
  async getJobProfitability(@Headers('authorization') auth: string | undefined) {
    return this.reportingService.getJobProfitability(getBearerToken(auth));
  }

  @Get('job-profitability/export')
  async exportJobProfitability(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportJobProfitability(
      getBearerToken(auth)
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
