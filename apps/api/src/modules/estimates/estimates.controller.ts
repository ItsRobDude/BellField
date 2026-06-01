import { Body, Controller, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { EstimatesService } from './estimates.service';
import {
  ConvertEstimateToInvoiceRequestBodyDto,
  CreateEstimateRequestBodyDto,
  DeclineEstimateRequestBodyDto,
  UpdateEstimateRequestBodyDto
} from './estimates.dto';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

// Estimates are job-owned, so list/create live under the job path. This mirrors
// the register-entry routing and keeps the "estimate attaches to a job" invariant
// visible in the URL shape.
@Controller('operations/jobs/:jobId/estimates')
export class JobEstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get()
  async listForJob(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.estimatesService.listEstimatesForJob(getBearerToken(authorizationHeader), jobId);
  }

  @Post()
  async create(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateEstimateRequestBodyDto
  ) {
    return this.estimatesService.createEstimate(
      getBearerToken(authorizationHeader),
      jobId,
      request
    );
  }
}

// Operations on an existing estimate are addressed by estimate id directly.
@Controller('operations/estimates')
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get(':estimateId')
  async getOne(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string
  ) {
    return this.estimatesService.getEstimate(getBearerToken(authorizationHeader), estimateId);
  }

  @Put(':estimateId')
  async update(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Body() request: UpdateEstimateRequestBodyDto
  ) {
    return this.estimatesService.updateEstimate(
      getBearerToken(authorizationHeader),
      estimateId,
      request
    );
  }

  @Post(':estimateId/approve')
  async approve(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string
  ) {
    return this.estimatesService.approveEstimate(getBearerToken(authorizationHeader), estimateId);
  }

  @Post(':estimateId/decline')
  async decline(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Body() request: DeclineEstimateRequestBodyDto
  ) {
    return this.estimatesService.declineEstimate(
      getBearerToken(authorizationHeader),
      estimateId,
      request
    );
  }

  @Post(':estimateId/convert-to-invoice')
  async convertToInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Body() request: ConvertEstimateToInvoiceRequestBodyDto
  ) {
    return this.estimatesService.convertToInvoice(
      getBearerToken(authorizationHeader),
      estimateId,
      request
    );
  }
}
