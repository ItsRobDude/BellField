import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { JobCostingService } from './job-costing.service';
import {
  CreateJobExpenseRequestBodyDto,
  CreateJobLaborRequestBodyDto,
  ResolveRegisterCostRequestBodyDto,
  ReverseJobCostEventRequestBodyDto,
  toResolveRegisterCostRequest
} from './job-costing.dto';

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

  @Post(':jobId/cost-events/:eventId/reverse')
  async reverseEvent(
    @Headers('authorization') auth: string | undefined,
    @Param('jobId') jobId: string,
    @Param('eventId') eventId: string,
    @Body() request: ReverseJobCostEventRequestBodyDto
  ) {
    return this.jobCostingService.reverseEvent(getBearerToken(auth), jobId, eventId, request);
  }

  @Post(':jobId/register-entries/:registerEntryId/resolve-cost')
  async resolveRegisterCost(
    @Headers('authorization') auth: string | undefined,
    @Param('jobId') jobId: string,
    @Param('registerEntryId') registerEntryId: string,
    @Body() request: ResolveRegisterCostRequestBodyDto
  ) {
    return this.jobCostingService.resolveRegisterCost(
      getBearerToken(auth),
      jobId,
      registerEntryId,
      toResolveRegisterCostRequest(request)
    );
  }
}
