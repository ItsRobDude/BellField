import { Body, Controller, Get, Headers, Put } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { UpdateCompanySettingsRequestBodyDto } from './company-settings.dto';
import { CompanySettingsService } from './company-settings.service';

@Controller('operations/company-settings')
export class CompanySettingsController {
  constructor(private readonly companySettingsService: CompanySettingsService) {}

  @Get()
  async getSettings(@Headers('authorization') auth: string | undefined) {
    return this.companySettingsService.getSettings(getBearerToken(auth));
  }

  @Get('delivery-status')
  async getEstimateEmailDeliveryStatus(@Headers('authorization') auth: string | undefined) {
    return this.companySettingsService.getEstimateEmailDeliveryStatus(getBearerToken(auth));
  }

  @Put()
  async updateSettings(
    @Headers('authorization') auth: string | undefined,
    @Body() request: UpdateCompanySettingsRequestBodyDto
  ) {
    return this.companySettingsService.updateSettings(getBearerToken(auth), request);
  }
}
