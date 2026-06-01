import { Controller, Get, Headers, Param } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

// A job owns one main invoice, so the draft is addressed under the job path.
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
}
