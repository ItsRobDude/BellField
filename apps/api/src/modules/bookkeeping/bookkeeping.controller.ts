import { Controller, Get, Headers } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

@Controller('operations/bookkeeping')
export class BookkeepingController {
  constructor(private readonly bookkeepingService: BookkeepingService) {}

  @Get('invoice-queues')
  async getInvoiceQueues(@Headers('authorization') authorizationHeader: string | undefined) {
    return this.bookkeepingService.getInvoiceQueues(getBearerToken(authorizationHeader));
  }
}
