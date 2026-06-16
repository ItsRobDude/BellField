import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { PaymentsService } from './payments.service';
import {
  RecordPaymentRequestBodyDto,
  RecordRefundRequestBodyDto,
  VoidPaymentRequestBodyDto
} from './payments.dto';
import { OnlinePaymentLinkService } from './online-payment-link.service';
import {
  CreateDepositPaymentLinkRequestBodyDto,
  CreateOnlinePaymentLinkRequestBodyDto
} from './online-payment-link.dto';
import { OnlineRefundService } from './online-refund.service';
import { RequestOnlineRefundBodyDto } from './online-refund.dto';

// Payments are listed at the job level (a job's whole payment history across its
// invoices).
@Controller('operations/jobs/:jobId/invoice/payments')
export class JobPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.paymentsService.getJobPayments(getBearerToken(authorizationHeader), jobId);
  }
}

// Deposit links are job-level: they can be collected before an invoice is posted
// and land as unallocated job credit until there are posted charges to apply.
@Controller('operations/jobs/:jobId/payments')
export class JobPaymentLinksController {
  constructor(private readonly onlinePaymentLinkService: OnlinePaymentLinkService) {}

  @Post('deposit-link')
  async createDepositPaymentLink(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateDepositPaymentLinkRequestBodyDto
  ) {
    return this.onlinePaymentLinkService.createDepositPaymentLink(
      getBearerToken(authorizationHeader),
      jobId,
      request
    );
  }
}

// A payment is recorded against a specific posted invoice (main or adjustment).
@Controller('operations/invoices/:invoiceId/payments')
export class InvoicePaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly onlinePaymentLinkService: OnlinePaymentLinkService
  ) {}

  @Post()
  async record(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string,
    @Body() request: RecordPaymentRequestBodyDto
  ) {
    return this.paymentsService.recordPayment(
      getBearerToken(authorizationHeader),
      invoiceId,
      request
    );
  }

  @Post('online-link')
  async createOnlinePaymentLink(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoiceId') invoiceId: string,
    @Body() request: CreateOnlinePaymentLinkRequestBodyDto
  ) {
    return this.onlinePaymentLinkService.createOnlinePaymentLink(
      getBearerToken(authorizationHeader),
      invoiceId,
      request
    );
  }
}

// Voiding addresses a payment by its own id (the correction path).
@Controller('operations/payments')
export class PaymentController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly onlineRefundService: OnlineRefundService
  ) {}

  @Post(':paymentId/void')
  async void(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('paymentId') paymentId: string,
    @Body() request: VoidPaymentRequestBodyDto
  ) {
    return this.paymentsService.voidPayment(
      getBearerToken(authorizationHeader),
      paymentId,
      request
    );
  }

  @Post(':paymentId/refund')
  async refund(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('paymentId') paymentId: string,
    @Body() request: RecordRefundRequestBodyDto
  ) {
    return this.paymentsService.refundPayment(
      getBearerToken(authorizationHeader),
      paymentId,
      request
    );
  }

  // Online (Stripe-via-relay) refund of a provider-confirmed card payment. Kept
  // separate from /refund, which stays manual-only: this opens a pending request
  // the worker confirms from a Stripe refund event.
  @Post(':paymentId/online-refund')
  async onlineRefund(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('paymentId') paymentId: string,
    @Body() request: RequestOnlineRefundBodyDto
  ) {
    return this.onlineRefundService.requestOnlineRefund(
      getBearerToken(authorizationHeader),
      paymentId,
      request
    );
  }
}
