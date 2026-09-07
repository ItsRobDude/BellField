import { Controller, Get, Headers, Query } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { BookkeepingService } from './bookkeeping.service';

@Controller('operations/bookkeeping')
export class BookkeepingController {
  constructor(private readonly bookkeepingService: BookkeepingService) {}

  @Get('invoice-queues')
  async getInvoiceQueues(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limit?: string,
    @Query('readyToPostCursor') readyToPostCursor?: string,
    @Query('openBalanceCursor') openBalanceCursor?: string,
    @Query('recentlyPostedCursor') recentlyPostedCursor?: string,
    @Query('paymentBatchesCursor') paymentBatchesCursor?: string
  ) {
    return this.bookkeepingService.getInvoiceQueues(getBearerToken(authorizationHeader), {
      limit,
      cursors: {
        readyToPost: readyToPostCursor,
        openBalance: openBalanceCursor,
        recentlyPosted: recentlyPostedCursor,
        paymentBatches: paymentBatchesCursor
      }
    });
  }
}
