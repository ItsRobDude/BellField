import { Body, Controller, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoiceLineItemInputDto, VoidInvoiceLineItemRequestBodyDto } from './invoices.dto';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

// A job owns one main invoice, so the draft and its line additions are addressed
// under the job path.
@Controller('operations/jobs/:jobId/invoice')
export class JobInvoiceController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  async getForJob(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.invoicesService.getInvoiceForJob(getBearerToken(authorizationHeader), jobId);
  }

  @Post('lines')
  async addLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: InvoiceLineItemInputDto
  ) {
    return this.invoicesService.addLine(getBearerToken(authorizationHeader), jobId, request);
  }

  // Post (lock) the job's main invoice draft. No body: the job is in the path and the
  // actor comes from the session.
  @Post('post')
  async post(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.invoicesService.postInvoice(getBearerToken(authorizationHeader), jobId);
  }
}

// Operations on an existing invoice line are addressed by line id directly.
@Controller('operations/invoices/lines')
export class InvoiceLineController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Put(':lineId')
  async editLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('lineId') lineId: string,
    @Body() request: InvoiceLineItemInputDto
  ) {
    return this.invoicesService.editLine(getBearerToken(authorizationHeader), lineId, request);
  }

  @Post(':lineId/void')
  async voidLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('lineId') lineId: string,
    @Body() request: VoidInvoiceLineItemRequestBodyDto
  ) {
    return this.invoicesService.voidLine(getBearerToken(authorizationHeader), lineId, request);
  }
}
