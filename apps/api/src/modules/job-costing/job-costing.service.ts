import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateJobExpenseRequest,
  CreateJobLaborRequest,
  JobCostEventResponse
} from '@bellfield/contracts';
import { centsToDollars, dollarsToCents } from '@bellfield/estimating';
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
    const actor = await this.authorizeCreate(sessionToken);
    const description = requireDescription(request.description);
    if (request.hours <= 0) {
      throw new BadRequestException('Labor hours must be greater than zero.');
    }
    if (request.ratePerHour < 0) {
      throw new BadRequestException('Labor rate cannot be negative.');
    }
    await this.requireJob(jobId);

    // Compute the cost in whole cents (half-up, float-noise absorbed) before storing.
    const amount = centsToDollars(dollarsToCents(request.hours * request.ratePerHour));
    if (amount <= 0) {
      throw new BadRequestException('Labor cost must be greater than zero.');
    }

    const event = await this.jobCostingRepository.insertLabor({
      jobId,
      description,
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
    const actor = await this.authorizeCreate(sessionToken);
    const description = requireDescription(request.description);
    if (request.amount <= 0) {
      throw new BadRequestException('Expense amount must be greater than zero.');
    }
    await this.requireJob(jobId);

    const event = await this.jobCostingRepository.insertExpense({
      jobId,
      description,
      amount: centsToDollars(dollarsToCents(request.amount)),
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { event };
  }

  private async requireJob(jobId: string) {
    if (!(await this.jobCostingRepository.jobExists(jobId))) {
      throw new NotFoundException('Job not found.');
    }
  }

  /**
   * Posting job costs is gated on the dedicated, office-only jobCosting area (not the
   * broad jobs:edit), since job cost is internal financial data.
   */
  private authorizeCreate(sessionToken: string) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobCosting:create', [
      'office-web'
    ]);
  }
}

/** Reject a description that is empty once trimmed (the DTO only checks the raw body). */
function requireDescription(raw: string): string {
  const description = raw.trim();
  if (!description) {
    throw new BadRequestException('A description is required.');
  }
  return description;
}
