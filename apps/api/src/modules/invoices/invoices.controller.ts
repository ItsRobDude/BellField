import { Body, Controller, Get, Headers, Param, Post, Put, Res } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { InvoiceDeliveryService } from './invoice-delivery.service';
import { InvoicesService } from './invoices.service';
import {
  CreateAdjustmentRequestBodyDto,
  InvoiceLineItemInputDto,
  SendInvoiceRequestBodyDto,
  VoidInvoiceLineItemRequestBodyDto
} from './invoices.dto';

type MinimalResponse = { setHeader: (name: string, value: string) => void };

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

  // Net amount billed on the job across its posted invoices (main + adjustments − credits).
  @Get('balance')
  async getBalance(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.invoicesService.getJobInvoiceBalance(getBearerToken(authorizationHeader), jobId);
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

  // List the job's adjustment/credit correction records (each a full invoice).
  @Get('adjustments')
  async listAdjustments(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.invoicesService.getJobAdjustments(getBearerToken(authorizationHeader), jobId);
  }

  // Create an adjustment or credit against the job's posted main invoice.
  @Post('adjustments')
  async createAdjustment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateAdjustmentRequestBodyDto
  ) {
    return this.invoicesService.createAdjustment(
      getBearerToken(authorizationHeader),
      jobId,
      request
    );
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

// Operations that address an invoice by id directly — used for adjustment/credit records
// (the job-scoped controller above covers the one main invoice). The static `lines/...`
// routes live on InvoiceLineController; these `:invoiceId` routes never collide with them
// (different segment shapes), and reads/writes here work for the main or an adjustment.
@Controller('operations/invoices')
export class InvoiceController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoiceDeliveryService: InvoiceDeliveryService
  ) {}

  @Get(':invoiceId')
  async getOne(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string
  ) {
    return this.invoicesService.getInvoice(getBearerToken(authorizationHeader), invoiceId);
  }

  @Get(':invoiceId/document')
  async exportDocument(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const document = await this.invoicesService.exportInvoiceDocument(
      getBearerToken(authorizationHeader),
      invoiceId
    );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    return document.html;
  }

  @Get(':invoiceId/send-preview')
  async getSendPreview(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string
  ) {
    return this.invoiceDeliveryService.getInvoiceSendPreview(
      getBearerToken(authorizationHeader),
      invoiceId
    );
  }

  @Post(':invoiceId/send')
  async sendInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string,
    @Body() request: SendInvoiceRequestBodyDto
  ) {
    return this.invoiceDeliveryService.sendInvoice(
      getBearerToken(authorizationHeader),
      invoiceId,
      request
    );
  }

  @Get(':invoiceId/outbound-messages')
  async listOutboundMessages(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string
  ) {
    return this.invoiceDeliveryService.listInvoiceOutboundMessages(
      getBearerToken(authorizationHeader),
      invoiceId
    );
  }

  @Post(':invoiceId/outbound-messages/:outboundMessageId/cancel')
  async cancelOutboundMessage(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string,
    @Param('outboundMessageId') outboundMessageId: string
  ) {
    return this.invoiceDeliveryService.cancelInvoiceOutboundMessage(
      getBearerToken(authorizationHeader),
      invoiceId,
      outboundMessageId
    );
  }

  @Post(':invoiceId/lines')
  async addLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string,
    @Body() request: InvoiceLineItemInputDto
  ) {
    return this.invoicesService.addInvoiceLine(
      getBearerToken(authorizationHeader),
      invoiceId,
      request
    );
  }

  @Post(':invoiceId/post')
  async post(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string
  ) {
    return this.invoicesService.postInvoiceById(getBearerToken(authorizationHeader), invoiceId);
  }
}
