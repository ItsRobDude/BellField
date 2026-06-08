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

  @Get('ar-aging')
  async getArAging(@Headers('authorization') auth: string | undefined) {
    return this.reportingService.getArAging(getBearerToken(auth));
  }

  @Get('ar-aging/export')
  async exportArAging(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportArAging(getBearerToken(auth));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('sales-tax-summary')
  async getSalesTaxSummary(@Headers('authorization') auth: string | undefined) {
    return this.reportingService.getSalesTaxSummary(getBearerToken(auth));
  }

  @Get('sales-tax-summary/export')
  async exportSalesTaxSummary(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportSalesTaxSummary(
      getBearerToken(auth)
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('posted-invoices/export')
  async exportPostedInvoices(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportPostedInvoices(
      getBearerToken(auth)
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('payment-ledger/export')
  async exportPaymentLedger(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportPaymentLedger(getBearerToken(auth));
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

  @Get('inventory-valuation')
  async getInventoryValuation(@Headers('authorization') auth: string | undefined) {
    return this.reportingService.getInventoryValuation(getBearerToken(auth));
  }

  @Get('inventory-valuation/export')
  async exportInventoryValuation(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const { filename, csv } = await this.reportingService.exportInventoryValuation(
      getBearerToken(auth)
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
