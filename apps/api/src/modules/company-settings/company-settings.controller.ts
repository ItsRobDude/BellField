import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { UpdateCompanySettingsRequestBodyDto } from './company-settings.dto';
import { CompanySettingsService } from './company-settings.service';
import { OnlinePaymentsSetupService } from './online-payments-setup.service';

@Controller('operations/company-settings')
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
    private readonly onlinePaymentsSetupService: OnlinePaymentsSetupService
  ) {}

  @Get()
  async getSettings(@Headers('authorization') auth: string | undefined) {
    return this.companySettingsService.getSettings(getBearerToken(auth));
  }

  @Get('delivery-status')
  async getEstimateEmailDeliveryStatus(@Headers('authorization') auth: string | undefined) {
    return this.companySettingsService.getEstimateEmailDeliveryStatus(getBearerToken(auth));
  }

  @Get('payments/setup-status')
  async getOnlinePaymentsSetupStatus(@Headers('authorization') auth: string | undefined) {
    return this.onlinePaymentsSetupService.getSetupStatus(getBearerToken(auth));
  }

  @Post('payments/setup-link')
  async createOnlinePaymentsSetupLink(@Headers('authorization') auth: string | undefined) {
    return this.onlinePaymentsSetupService.createSetupLink(getBearerToken(auth));
  }

  @Post('payments/setup-refresh')
  async refreshOnlinePaymentsSetupLink(@Headers('authorization') auth: string | undefined) {
    return this.onlinePaymentsSetupService.refreshSetupLink(getBearerToken(auth));
  }

  @Put()
  async updateSettings(
    @Headers('authorization') auth: string | undefined,
    @Body() request: UpdateCompanySettingsRequestBodyDto
  ) {
    return this.companySettingsService.updateSettings(getBearerToken(auth), request);
  }
}
