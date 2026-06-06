import { Controller, Get, Headers, Query } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { HistoryQueryDto } from './history.dto';
import { HistoryService } from './history.service';

@Controller('operations/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  async getHistory(
    @Headers('authorization') auth: string | undefined,
    @Query() query: HistoryQueryDto
  ) {
    return this.historyService.getHistory(getBearerToken(auth), query);
  }
}
