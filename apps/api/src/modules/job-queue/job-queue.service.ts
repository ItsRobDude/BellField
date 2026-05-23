import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  JobsQueueItem,
  JobsQueueKey,
  JobsQueueSection
} from '@bellfield/contracts';
import type { JobsQueueCursor, JobsQueueItemRecord } from '../company-data/company-data.types';
import { JobsDataService } from '../company-data/jobs-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type { JobsQueueResponseDto } from './job-queue.types';

const defaultQueueLimit = 20;
const maxQueueLimit = 50;
const queueKeys: JobsQueueKey[] = ['review', 'waitingOnParts', 'unscheduled', 'open'];

type JobsQueueRequestQuery = {
  limit?: string;
  cursors: Partial<Record<JobsQueueKey, string | undefined>>;
};

@Injectable()
export class JobQueueService {
  constructor(
    private readonly jobsDataService: JobsDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getJobsQueue(sessionToken: string, query: JobsQueueRequestQuery): Promise<JobsQueueResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:view', ['office-web']);
    const limit = this.parseLimit(query.limit);

    const queues = await Promise.all(
      queueKeys.map(async (queueKey) => {
        const cursor = this.decodeCursor(query.cursors[queueKey], `${queueKey}Cursor`, queueKey);
        const page = await this.jobsDataService.listJobsQueuePage(queueKey, limit + 1, cursor);
        const visibleJobs = page.jobs.slice(0, limit);
        const lastVisibleJob = visibleJobs[visibleJobs.length - 1];

        return {
          key: queueKey,
          totalCount: page.totalCount,
          jobs: visibleJobs.map((job) => this.toJobsQueueItem(job)),
          nextCursor: page.jobs.length > limit && lastVisibleJob ? this.encodeCursor(queueKey, lastVisibleJob) : undefined
        } satisfies JobsQueueSection;
      })
    );

    return { limit, queues };
  }

  private parseLimit(value: string | undefined): number {
    if (!value) {
      return defaultQueueLimit;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    if (parsed > maxQueueLimit) {
      throw new BadRequestException(`limit cannot exceed ${maxQueueLimit}.`);
    }

    return parsed;
  }

  private decodeCursor(
    value: string | undefined,
    fieldName: string,
    queueKey: JobsQueueKey
  ): JobsQueueCursor | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<JobsQueueCursor>;
      if (
        typeof decoded.id !== 'string' ||
        decoded.id.length === 0 ||
        decoded.queueKey !== queueKey ||
        typeof decoded.updatedAt !== 'string' ||
        Number.isNaN(new Date(decoded.updatedAt).getTime())
      ) {
        throw new Error('Invalid cursor payload.');
      }

      return {
        queueKey,
        id: decoded.id,
        updatedAt: decoded.updatedAt
      };
    } catch {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }
  }

  private encodeCursor(queueKey: JobsQueueKey, job: JobsQueueItemRecord): string {
    return Buffer.from(JSON.stringify({ queueKey, id: job.id, updatedAt: job.updatedAt }), 'utf8').toString(
      'base64url'
    );
  }

  private toJobsQueueItem(job: JobsQueueItemRecord): JobsQueueItem {
    return {
      id: job.id,
      jobNumber: job.jobNumber,
      locationId: job.locationId,
      locationName: job.locationName,
      billToCustomerId: job.billToCustomerId,
      billToCustomerName: job.billToCustomerName,
      jobType: job.jobType,
      category: job.category,
      origin: job.origin,
      summary: job.summary,
      status: job.status,
      workOrderNumber: job.workOrderNumber,
      needsScheduling: job.needsScheduling,
      needsOfficeReview: job.needsOfficeReview,
      nextAppointment: job.nextAppointment ? { ...job.nextAppointment } : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }
}
