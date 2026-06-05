import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type {
  CreateJobExpenseRequest,
  CreateJobLaborRequest,
  JobCostEventResponse,
  JobCostingResponse,
  ResolveRegisterCostRequest,
  ReverseJobCostEventRequest
} from '@bellfield/contracts';
import { centsToDollars, dollarsToCents } from '@bellfield/estimating';
import {
  isFinalJobStatus,
  REOPEN_FOR_COST_WRITE_MESSAGE
} from '../company-data/company-data.types';
import { JobsDataService } from '../company-data/jobs-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobCostingRepository } from './job-costing.repository';

@Injectable()
export class JobCostingService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobCostingRepository: JobCostingRepository,
    private readonly jobsDataService: JobsDataService
  ) {}

  /**
   * Resolve the cost of a register line in `needsResolution`: the office picks how it costs
   * (stock issue / non-stock material / labor / zero-cost), the server creates the linked cost
   * artifact and moves the line to `applied`, and the refreshed job costing is returned.
   */
  async resolveRegisterCost(
    sessionToken: string,
    jobId: string,
    registerEntryId: string,
    resolution: ResolveRegisterCostRequest
  ): Promise<JobCostingResponse> {
    const actor = await this.authorizeCreate(sessionToken);
    const entry = await this.jobsDataService.getRegisterEntryById(registerEntryId);
    if (entry.jobId !== jobId) {
      throw new NotFoundException('Register entry not found for this job.');
    }
    await this.jobsDataService.resolveRegisterEntryCost(registerEntryId, resolution, {
      id: actor.id,
      displayName: actor.displayName
    });
    const costing = await this.jobCostingRepository.getJobCosting(jobId);
    if (!costing) {
      throw new NotFoundException('Job not found.');
    }
    return { costing };
  }

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
    await this.requireWritableJob(jobId);

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
    await this.requireWritableJob(jobId);

    const event = await this.jobCostingRepository.insertExpense({
      jobId,
      description,
      amount: centsToDollars(dollarsToCents(request.amount)),
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { event };
  }

  /**
   * Reverse (correct) a job cost event by posting its negation. The original is never
   * mutated; the reversal nets it out of the live rollup. Each event can be reversed once,
   * and a reversal cannot itself be reversed. A finalized snapshot is left untouched.
   */
  async reverseEvent(
    sessionToken: string,
    jobId: string,
    eventId: string,
    request: ReverseJobCostEventRequest
  ): Promise<JobCostEventResponse> {
    const actor = await this.authorizeEdit(sessionToken);

    const original = await this.jobCostingRepository.getById(eventId);
    if (!original || original.jobId !== jobId) {
      throw new NotFoundException('Job cost event not found.');
    }
    await this.requireWritableJob(jobId);
    if (original.reversalOfEventId) {
      throw new ConflictException('A reversal event cannot itself be reversed.');
    }
    if (original.sourceRegisterEntryId) {
      // This cost came from resolving a register line. Reversing the event alone would net the
      // cost out while the line stayed `applied` (no re-resolution path). Void the register line
      // instead — that reverses the artifact AND moves the line back out of `applied`.
      throw new ConflictException(
        'This cost came from a register line; void that line to reverse its cost.'
      );
    }
    if (await this.jobCostingRepository.isEventReversed(eventId)) {
      throw new ConflictException('This cost event has already been reversed.');
    }

    const description =
      request.reason?.trim() || `Reversal of: ${original.description}`.slice(0, 500);

    try {
      const event = await this.jobCostingRepository.insertReversal({
        jobId,
        kind: original.kind,
        description,
        amount: -original.amount,
        hours: original.hours ?? null,
        ratePerHour: original.ratePerHour ?? null,
        reversalOfEventId: original.id,
        // Carry the source register link onto the reversal too, so the audit trail stays
        // intact when a register-driven cost is reversed.
        sourceRegisterEntryId: original.sourceRegisterEntryId ?? null,
        actor: { id: actor.id, displayName: actor.displayName }
      });
      return { event };
    } catch (error) {
      // Lost a race against a concurrent reversal (the one-reversal-per-event unique index).
      if (isUniqueViolation(error)) {
        throw new ConflictException('This cost event has already been reversed.');
      }
      throw error;
    }
  }

  /** Read a job's cost: the live rollup plus the finalized snapshot, if any. */
  async getJobCosting(sessionToken: string, jobId: string): Promise<JobCostingResponse> {
    await this.authorizeView(sessionToken);
    const costing = await this.jobCostingRepository.getJobCosting(jobId);
    if (!costing) {
      throw new NotFoundException('Job not found.');
    }
    return { costing };
  }

  /**
   * The job must exist and be open: cost writes are blocked on a final job (completed/closed/
   * cancelled) so the finalized cost can't drift — reopen the job to revise it.
   */
  private async requireWritableJob(jobId: string) {
    const status = await this.jobCostingRepository.getJobStatus(jobId);
    if (status === null) {
      throw new NotFoundException('Job not found.');
    }
    if (isFinalJobStatus(status)) {
      throw new ConflictException(REOPEN_FOR_COST_WRITE_MESSAGE);
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

  /** Reading job cost is gated on the dedicated, office-only jobCosting area. */
  private authorizeView(sessionToken: string) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobCosting:view', [
      'office-web'
    ]);
  }

  /** Correcting (reversing) job costs is an office-only jobCosting:edit action. */
  private authorizeEdit(sessionToken: string) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobCosting:edit', [
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

/** A Postgres unique-constraint violation (e.g. the one-reversal-per-event index). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
