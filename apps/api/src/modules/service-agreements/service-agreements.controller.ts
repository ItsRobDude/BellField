import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import {
  CreateServiceAgreementRequestBodyDto,
  ListServiceAgreementsQueryDto,
  ServiceAgreementReferenceDataQueryDto,
  ServiceAgreementStatusChangeRequestBodyDto,
  UpdateServiceAgreementRequestBodyDto
} from './service-agreements.dto';
import { ServiceAgreementsService } from './service-agreements.service';

@Controller('operations/service-agreements')
export class ServiceAgreementsController {
  constructor(private readonly serviceAgreementsService: ServiceAgreementsService) {}

  @Get()
  async listAgreements(
    @Headers('authorization') auth: string | undefined,
    @Query() query: ListServiceAgreementsQueryDto
  ) {
    return this.serviceAgreementsService.listAgreements(getBearerToken(auth), query);
  }

  @Get('reference-data')
  async getReferenceData(
    @Headers('authorization') auth: string | undefined,
    @Query() query: ServiceAgreementReferenceDataQueryDto
  ) {
    return this.serviceAgreementsService.getReferenceData(getBearerToken(auth), query.agreementId);
  }

  @Get(':agreementId')
  async getAgreement(
    @Headers('authorization') auth: string | undefined,
    @Param('agreementId') agreementId: string
  ) {
    return this.serviceAgreementsService.getAgreement(getBearerToken(auth), agreementId);
  }

  @Post()
  async createAgreement(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateServiceAgreementRequestBodyDto
  ) {
    return this.serviceAgreementsService.createAgreement(getBearerToken(auth), request);
  }

  @Put(':agreementId')
  async updateAgreement(
    @Headers('authorization') auth: string | undefined,
    @Param('agreementId') agreementId: string,
    @Body() request: UpdateServiceAgreementRequestBodyDto
  ) {
    return this.serviceAgreementsService.updateAgreement(
      getBearerToken(auth),
      agreementId,
      request
    );
  }

  @Post(':agreementId/activate')
  async activateAgreement(
    @Headers('authorization') auth: string | undefined,
    @Param('agreementId') agreementId: string,
    @Body() request: ServiceAgreementStatusChangeRequestBodyDto
  ) {
    return this.serviceAgreementsService.activateAgreement(
      getBearerToken(auth),
      agreementId,
      request
    );
  }

  @Post(':agreementId/pause')
  async pauseAgreement(
    @Headers('authorization') auth: string | undefined,
    @Param('agreementId') agreementId: string,
    @Body() request: ServiceAgreementStatusChangeRequestBodyDto
  ) {
    return this.serviceAgreementsService.pauseAgreement(getBearerToken(auth), agreementId, request);
  }

  @Post(':agreementId/end')
  async endAgreement(
    @Headers('authorization') auth: string | undefined,
    @Param('agreementId') agreementId: string,
    @Body() request: ServiceAgreementStatusChangeRequestBodyDto
  ) {
    return this.serviceAgreementsService.endAgreement(getBearerToken(auth), agreementId, request);
  }
}
