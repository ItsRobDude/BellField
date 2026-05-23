import { Controller, Get, Headers, Query } from '@nestjs/common';
import { JobQueueService } from './job-queue.service';

@Controller('operations/jobs/queue')
export class JobQueueController {
  constructor(private readonly jobQueueService: JobQueueService) {}

  @Get()
  async getJobsQueue(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limit?: string,
    @Query('reviewCursor') reviewCursor?: string,
    @Query('waitingOnPartsCursor') waitingOnPartsCursor?: string,
    @Query('unscheduledCursor') unscheduledCursor?: string,
    @Query('openCursor') openCursor?: string
  ) {
    return this.jobQueueService.getJobsQueue(this.getBearerToken(authorizationHeader), {
      limit,
      cursors: {
        review: reviewCursor,
        waitingOnParts: waitingOnPartsCursor,
        unscheduled: unscheduledCursor,
        open: openCursor
      }
    });
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
