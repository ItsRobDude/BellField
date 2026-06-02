import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RecordPaymentRequestBodyDto, VoidPaymentRequestBodyDto } from './payments.dto';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

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

// A payment is recorded against a specific posted invoice (main or adjustment).
@Controller('operations/invoices/:invoiceId/payments')
export class InvoicePaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
}

// Voiding addresses a payment by its own id (the correction path).
@Controller('operations/payments')
export class PaymentController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
}
