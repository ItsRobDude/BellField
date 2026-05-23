import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { JobDetailService } from './job-detail.service';

@Controller('operations/jobs')
export class JobDetailController {
  constructor(private readonly jobDetailService: JobDetailService) {}

  @Get(':jobId/detail')
  async getJobDetail(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Query('timelineLimit') timelineLimit?: string
  ) {
    return this.jobDetailService.getJobDetail(this.getBearerToken(authorizationHeader), jobId, timelineLimit);
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
