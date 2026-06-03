import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { JobCostingService } from './job-costing.service';
import { CreateJobExpenseRequestBodyDto, CreateJobLaborRequestBodyDto } from './job-costing.dto';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

@Controller('operations/jobs')
export class JobCostingController {
  constructor(private readonly jobCostingService: JobCostingService) {}

  @Get(':jobId/costing')
  async getCosting(
    @Headers('authorization') auth: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.jobCostingService.getJobCosting(getBearerToken(auth), jobId);
  }

  @Post(':jobId/labor')
  async postLabor(
    @Headers('authorization') auth: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateJobLaborRequestBodyDto
  ) {
    return this.jobCostingService.postLabor(getBearerToken(auth), jobId, request);
  }

  @Post(':jobId/expenses')
  async postExpense(
    @Headers('authorization') auth: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateJobExpenseRequestBodyDto
  ) {
    return this.jobCostingService.postExpense(getBearerToken(auth), jobId, request);
  }
}
