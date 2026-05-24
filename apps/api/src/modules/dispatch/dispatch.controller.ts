import { Controller, Get, Headers, Query } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

@Controller('operations/dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get()
  async getDispatchBoard(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dispatchService.getDispatchBoard(
      this.getBearerToken(authorizationHeader),
      startDate,
      endDate
    );
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
