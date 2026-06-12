import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Res,
  StreamableFile
} from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { EstimatesService } from './estimates.service';
import {
  ApproveEstimateRequestBodyDto,
  ConvertEstimateToInvoiceRequestBodyDto,
  CreateEstimateRequestBodyDto,
  DeclineEstimateRequestBodyDto,
  SendEstimateRequestBodyDto,
  UpdateEstimateRequestBodyDto
} from './estimates.dto';

type MinimalResponse = { setHeader: (name: string, value: string) => void };

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

  @Get(':estimateId/document')
  async exportDocument(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const document = await this.estimatesService.exportEstimateDocument(
      getBearerToken(authorizationHeader),
      estimateId
    );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    return document.html;
  }

  @Get(':estimateId/pdf')
  async exportPdf(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const document = await this.estimatesService.exportEstimatePdfDocument(
      getBearerToken(authorizationHeader),
      estimateId
    );
    response.setHeader('Content-Type', document.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    response.setHeader('Content-Length', String(document.bytes.byteLength));
    // A raw Buffer return would go through the Express adapter's res.json()
    // and be serialized as {"type":"Buffer","data":[...]}; StreamableFile
    // streams the bytes untouched.
    return new StreamableFile(document.bytes);
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
    @Param('estimateId') estimateId: string,
    @Body() request: ApproveEstimateRequestBodyDto
  ) {
    return this.estimatesService.approveEstimate(
      getBearerToken(authorizationHeader),
      estimateId,
      request
    );
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

  @Post(':estimateId/send')
  async sendEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Body() request: SendEstimateRequestBodyDto
  ) {
    return this.estimatesService.sendEstimate(
      getBearerToken(authorizationHeader),
      estimateId,
      request
    );
  }

  @Get(':estimateId/send-preview')
  async getSendPreview(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string
  ) {
    return this.estimatesService.getEstimateSendPreview(
      getBearerToken(authorizationHeader),
      estimateId
    );
  }

  @Get(':estimateId/outbound-messages')
  async listOutboundMessages(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string
  ) {
    return this.estimatesService.listEstimateOutboundMessages(
      getBearerToken(authorizationHeader),
      estimateId
    );
  }

  @Post(':estimateId/outbound-messages/:outboundMessageId/cancel')
  async cancelOutboundMessage(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimateId') estimateId: string,
    @Param('outboundMessageId') outboundMessageId: string
  ) {
    return this.estimatesService.cancelEstimateOutboundMessage(
      getBearerToken(authorizationHeader),
      estimateId,
      outboundMessageId
    );
  }
}
