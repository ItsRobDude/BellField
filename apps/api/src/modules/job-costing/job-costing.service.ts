import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateJobExpenseRequest,
  CreateJobLaborRequest,
  JobCostEventResponse
} from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobCostingRepository } from './job-costing.repository';

@Injectable()
export class JobCostingService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobCostingRepository: JobCostingRepository
  ) {}

  /** Post a labor cost to a job. amount = hours * ratePerHour (rounded to cents). */
  async postLabor(
    sessionToken: string,
    jobId: string,
    request: CreateJobLaborRequest
  ): Promise<JobCostEventResponse> {
    const actor = await this.authorizeEdit(sessionToken);
    if (request.hours <= 0) {
      throw new BadRequestException('Labor hours must be greater than zero.');
    }
    if (request.ratePerHour < 0) {
      throw new BadRequestException('Labor rate cannot be negative.');
    }
    await this.requireJob(jobId);

    const amount = roundMoney(request.hours * request.ratePerHour);
    if (amount <= 0) {
      throw new BadRequestException('Labor cost must be greater than zero.');
    }

    const event = await this.jobCostingRepository.insertLabor({
      jobId,
      description: request.description.trim(),
      hours: request.hours,
      ratePerHour: request.ratePerHour,
      amount,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { event };
  }

  /** Post an expense cost to a job. */
  async postExpense(
    sessionToken: string,
    jobId: string,
    request: CreateJobExpenseRequest
  ): Promise<JobCostEventResponse> {
    const actor = await this.authorizeEdit(sessionToken);
    if (request.amount <= 0) {
      throw new BadRequestException('Expense amount must be greater than zero.');
    }
    await this.requireJob(jobId);

    const event = await this.jobCostingRepository.insertExpense({
      jobId,
      description: request.description.trim(),
      amount: roundMoney(request.amount),
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { event };
  }

  private async requireJob(jobId: string) {
    if (!(await this.jobCostingRepository.jobExists(jobId))) {
      throw new NotFoundException('Job not found.');
    }
  }

  /** Posting job costs is an office-only edit action this milestone. */
  private authorizeEdit(sessionToken: string) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:edit', [
      'office-web'
    ]);
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
