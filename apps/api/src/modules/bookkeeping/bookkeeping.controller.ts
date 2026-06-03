import { Controller, Get, Headers } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { BookkeepingService } from './bookkeeping.service';

@Controller('operations/bookkeeping')
export class BookkeepingController {
  constructor(private readonly bookkeepingService: BookkeepingService) {}

  @Get('invoice-queues')
  async getInvoiceQueues(@Headers('authorization') authorizationHeader: string | undefined) {
    return this.bookkeepingService.getInvoiceQueues(getBearerToken(authorizationHeader));
  }
}
