import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import type {
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateJobInput,
  FinishedVisitReviewDecision,
  JobRecord,
  JobStatus,
  UpdateAppointmentScheduleInput
} from './company-data.types';
import { isReopenTransition } from './company-data.types';
import { ensureMainInvoiceDraft, insertJobTimelineEntry } from './jobs-data-repository-utils';
import {
  buildAppointmentCreatedMessage,
  buildFinishReviewMessage,
  buildScheduleUpdateMessage,
  type FinishReviewInput
} from './jobs-data-row-mappers';
import { JobsReadDataRepository } from './jobs-read-data.repository';
// Cross-module *-utils (allowed by the architecture guard): freeze/supersede the finalized
// job-cost snapshot in the same transaction as the status change, so a completed job's cost
// is frozen atomically and a reopen retires it. The rollup itself lives with job costing.
import {
  freezeJobCostSnapshot,
  supersedeCurrentJobCostSnapshot
} from '../job-costing/job-cost-rollup-utils';

/**
 * Command (write) side for jobs and appointments. Every public mutation is atomic: it either
 * opens its own database transaction, or (for createAppointment) runs inside the caller's
 * transaction when one is supplied — see createAppointment. Post-write reads are delegated to
 * JobsReadDataRepository so the read SQL has a single home.
 */
@Injectable()
export class JobsCommandDataRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly readRepository: JobsReadDataRepository
  ) {}

  async createJob(
    input: CreateJobInput,
    actorName: string,
    resolvedBillToCustomerId: string,
    locationName: string
  ): Promise<JobRecord> {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const scheduledDate = input.scheduledDate?.trim();
    const hasInitialAppointment = Boolean(
      scheduledDate || input.timeWindowLabel?.trim() || input.technicianId?.trim()
    );
    const initialStatus: JobStatus = hasInitialAppointment ? 'scheduled' : 'new';

    await this.databaseService.transaction(async (queryable) => {
      const jobNumberResult = await queryable.query<{ nextNumber: string | number }>(
        `select nextval('job_number_sequence') as "nextNumber"`
      );
      const jobNumber = String(jobNumberResult.rows[0]?.nextNumber ?? '1003');

      await queryable.query(
        `
          insert into jobs (
            id,
            job_number,
            location_id,
            bill_to_customer_id,
            job_type,
            category,
            origin,
            summary,
            status,
            work_order_number,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          jobId,
          jobNumber,
          input.locationId,
          resolvedBillToCustomerId,
          input.jobType.trim(),
          input.category.trim(),
          input.origin.trim(),
          input.summary.trim(),
          initialStatus,
          input.workOrderNumber?.trim() || null,
          now,
          now
        ]
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: now,
          actorName,
          kind: 'jobCreated',
          message: `Job ${jobNumber} created for ${locationName}${hasInitialAppointment ? ' with the first appointment scheduled.' : '.'}`
        },
        queryable
      );

      if (hasInitialAppointment) {
        await this.createAppointment(jobId, input, actorName, now, queryable);
      }

      // Every job owns one main invoice draft from the moment it exists.
      await ensureMainInvoiceDraft(jobId, now, queryable);
    });

    const job = await this.readRepository.getJobById(jobId);

    if (!job) {
      throw new Error('Created job could not be loaded.');
    }

    return job;
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    actorName: string,
    occurredAt?: string,
    // The status the caller validated its permission decision against. Verified under the
    // row lock so a concurrent change can't turn an authorized edit into an unauthorized
    // transition (e.g. a jobs:edit move racing a completion into an un-permissioned reopen).
    expectedCurrentStatus?: JobStatus
  ): Promise<JobRecord | null> {
    const timelineTime = occurredAt || new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
      // Lock the row and read the prior status so the cost-snapshot hook can tell a
      // completion from a reopen (and guard against re-snapshotting an already-completed job).
      const previousResult = await queryable.query<{ status: JobStatus }>(
        `select status from jobs where id = $1 for update`,
        [jobId]
      );
      const previousStatus = previousResult.rows[0]?.status;

      // Optimistic concurrency: if the status moved since the caller validated permissions,
      // reject so the request is re-evaluated against the true current status.
      if (
        expectedCurrentStatus !== undefined &&
        previousStatus !== undefined &&
        previousStatus !== expectedCurrentStatus
      ) {
        throw new ConflictException(
          'The job status changed since it was loaded. Reload the job and try again.'
        );
      }

      await queryable.query(
        `
          update jobs
          set status = $2, updated_at = $3
          where id = $1
        `,
        [jobId, status, timelineTime]
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'jobStatusUpdated',
          message: `Job status changed to ${status}.`
        },
        queryable
      );

      // Finalize job cost on completion; retire it on a reopen (final -> active). Both run in
      // this transaction so the snapshot can never disagree with the persisted status. Only
      // when the job actually exists (previousStatus is set) — a missing row no-ops here and
      // surfaces as not-found from the post-transaction read.
      if (previousStatus !== undefined) {
        // Entering a cost-final phase (completed OR closed) freezes the snapshot AND blocks
        // finalization while any line still needs cost resolution. `cancelled` is abandonment,
        // not a cost-complete state, so it is intentionally not guarded here. Coming from a
        // status that is already cost-final (e.g. completed -> closed) does not re-freeze.
        const enteringCostFinal =
          (status === 'completed' || status === 'closed') &&
          previousStatus !== 'completed' &&
          previousStatus !== 'closed';
        if (enteringCostFinal) {
          await freezeJobCostSnapshot(queryable, jobId, actorName, timelineTime);
        } else if (isReopenTransition(previousStatus, status)) {
          await supersedeCurrentJobCostSnapshot(queryable, jobId, timelineTime);
        }
      }

      if (status === 'cancelled') {
        await queryable.query(
          `
            update appointments
            set status = 'cancelled', updated_at = $2
            where job_id = $1
              and status <> 'cancelled'
          `,
          [jobId, timelineTime]
        );

        await insertJobTimelineEntry(
          {
            id: randomUUID(),
            jobId,
            occurredAt: timelineTime,
            actorName,
            kind: 'syncFlag',
            message: 'Appointments under the job were cancelled with the job.'
          },
          queryable
        );
      }
    });

    return this.readRepository.getJobById(jobId);
  }

  async createAppointment(
    jobId: string,
    input: CreateAppointmentInput,
    actorName: string,
    occurredAt?: string,
    queryable?: QueryExecutor
  ): Promise<AppointmentRecord> {
    // When a caller (createJob) already owns a transaction, join it so the appointment lands
    // atomically with the job insert. Called on its own (the add-follow-up path), open our own
    // transaction so the acknowledge/insert/status/timeline writes can't partially apply.
    if (queryable) {
      return this.createAppointmentWithin(queryable, jobId, input, actorName, occurredAt);
    }

    return this.databaseService.transaction((executor) =>
      this.createAppointmentWithin(executor, jobId, input, actorName, occurredAt)
    );
  }

  private async createAppointmentWithin(
    executor: QueryExecutor,
    jobId: string,
    input: CreateAppointmentInput,
    actorName: string,
    occurredAt?: string
  ): Promise<AppointmentRecord> {
    const timelineTime = occurredAt || new Date().toISOString();
    const appointmentId = randomUUID();
    const appointmentRecord: AppointmentRecord = {
      id: appointmentId,
      jobId,
      scheduledDate: input.scheduledDate?.trim() || undefined,
      scheduledStartTime: input.scheduledDate
        ? input.scheduledStartTime?.trim() || undefined
        : undefined,
      scheduledEndTime: input.scheduledDate
        ? input.scheduledEndTime?.trim() || undefined
        : undefined,
      timeWindowLabel: input.timeWindowLabel?.trim() || undefined,
      technicianId: input.technicianId?.trim() || undefined,
      status: 'scheduled',
      createdAt: timelineTime,
      updatedAt: timelineTime
    };

    await this.acknowledgeUnreviewedFinishedAppointments(
      jobId,
      'followUpScheduled',
      actorName,
      timelineTime,
      executor
    );

    await executor.query(
      `
        insert into appointments (
          id,
          job_id,
          scheduled_date,
          scheduled_start_time,
          scheduled_end_time,
          time_window_label,
          technician_id,
          status,
          finish_outcome,
          visit_notes,
          has_charge_activity,
          register_follow_up_note,
          finished_reviewed_at,
          finished_reviewed_by,
          finished_review_decision,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'scheduled', null, null, null, null, null, null, null, $8, $9)
      `,
      [
        appointmentRecord.id,
        appointmentRecord.jobId,
        appointmentRecord.scheduledDate ?? null,
        appointmentRecord.scheduledStartTime ?? null,
        appointmentRecord.scheduledEndTime ?? null,
        appointmentRecord.timeWindowLabel ?? null,
        appointmentRecord.technicianId ?? null,
        appointmentRecord.createdAt,
        appointmentRecord.updatedAt
      ]
    );

    await this.updateJobStatusForAppointmentMutation(jobId, timelineTime, executor);

    await insertJobTimelineEntry(
      {
        id: randomUUID(),
        jobId,
        occurredAt: timelineTime,
        actorName,
        kind: 'appointmentCreated',
        message: buildAppointmentCreatedMessage(appointmentRecord)
      },
      executor
    );

    return appointmentRecord;
  }

  async updateAppointmentSchedule(
    appointmentId: string,
    input: UpdateAppointmentScheduleInput,
    actorName: string,
    occurredAt?: string
  ): Promise<AppointmentRecord | null> {
    const appointment = await this.readRepository.getAppointmentById(appointmentId);

    if (!appointment) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const nextScheduledDate = input.scheduledDate?.trim() || null;
    const nextScheduledStartTime = nextScheduledDate
      ? input.scheduledStartTime?.trim() || null
      : null;
    const nextScheduledEndTime = nextScheduledDate ? input.scheduledEndTime?.trim() || null : null;
    const nextTimeWindowLabel = input.timeWindowLabel?.trim() || null;
    const nextTechnicianId = input.technicianId?.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update appointments
          set
            scheduled_date = $2,
            scheduled_start_time = $3,
            scheduled_end_time = $4,
            time_window_label = $5,
            technician_id = $6,
            updated_at = $7
          where id = $1
        `,
        [
          appointmentId,
          nextScheduledDate,
          nextScheduledStartTime,
          nextScheduledEndTime,
          nextTimeWindowLabel,
          nextTechnicianId,
          timelineTime
        ]
      );

      await this.updateJobStatusForAppointmentMutation(appointment.jobId, timelineTime, queryable);

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: appointment.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'appointmentScheduleUpdated',
          message: buildScheduleUpdateMessage(
            nextScheduledDate ?? undefined,
            nextScheduledStartTime ?? undefined,
            nextScheduledEndTime ?? undefined,
            nextTimeWindowLabel ?? undefined,
            nextTechnicianId ?? undefined
          )
        },
        queryable
      );
    });

    return this.readRepository.getAppointmentById(appointmentId);
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string,
    finishReview?: FinishReviewInput
  ): Promise<AppointmentRecord | null> {
    const appointment = await this.readRepository.getAppointmentById(appointmentId);

    if (!appointment) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const isFinishedStatus = status === 'finished';

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update appointments
          set
            status = $2,
            finish_outcome = $3,
            visit_notes = $4,
            has_charge_activity = $5,
            register_follow_up_note = $6,
            finished_reviewed_at = null,
            finished_reviewed_by = null,
            finished_review_decision = null,
            updated_at = $7
          where id = $1
        `,
        [
          appointmentId,
          status,
          isFinishedStatus ? (finishReview?.finishOutcome ?? null) : null,
          isFinishedStatus ? finishReview?.visitNotes?.trim() || null : null,
          isFinishedStatus ? (finishReview?.hasChargeActivity ?? null) : null,
          isFinishedStatus ? finishReview?.registerFollowUpNote?.trim() || null : null,
          timelineTime
        ]
      );

      await this.updateJobStatusForAppointmentProgress(
        appointment.jobId,
        status,
        timelineTime,
        queryable
      );

      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: appointment.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'appointmentStatusUpdated',
          message: `Appointment status changed to ${status}.`
        },
        queryable
      );

      if (isFinishedStatus) {
        await insertJobTimelineEntry(
          {
            id: randomUUID(),
            jobId: appointment.jobId,
            occurredAt: timelineTime,
            actorName,
            kind: 'appointmentFinishedReview',
            message: buildFinishReviewMessage(finishReview)
          },
          queryable
        );
      }
    });

    return this.readRepository.getAppointmentById(appointmentId);
  }

  async acknowledgeFinishedVisitReview(
    jobId: string,
    decision: FinishedVisitReviewDecision,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord | null> {
    const timelineTime = occurredAt || new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
      await this.acknowledgeUnreviewedFinishedAppointments(
        jobId,
        decision,
        actorName,
        timelineTime,
        queryable
      );
    });

    return this.readRepository.getJobById(jobId);
  }

  async addJobNote(
    jobId: string,
    noteBody: string,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord | null> {
    const timelineTime = occurredAt || new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'jobNote',
          message: noteBody.trim()
        },
        queryable
      );
    });

    return this.readRepository.getJobById(jobId);
  }

  async addSyncFlag(
    jobId: string,
    message: string,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord | null> {
    const timelineTime = occurredAt || new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'syncFlag',
          message
        },
        queryable
      );
    });

    return this.readRepository.getJobById(jobId);
  }

  private async updateJobStatusForAppointmentMutation(
    jobId: string,
    updatedAt: string,
    queryable: QueryExecutor
  ): Promise<void> {
    const nextStatus = await this.getDerivedJobStatus(jobId, queryable);

    if (!nextStatus) {
      return;
    }

    await queryable.query(
      `
        update jobs
        set status = $2, updated_at = $3
        where id = $1
          and status not in ('closed', 'cancelled')
      `,
      [jobId, nextStatus, updatedAt]
    );
  }

  private async acknowledgeUnreviewedFinishedAppointments(
    jobId: string,
    decision: FinishedVisitReviewDecision,
    actorName: string,
    timelineTime: string,
    queryable: QueryExecutor
  ): Promise<number> {
    const result = await queryable.query<{ reviewedCount: number | string }>(
      `
        with reviewed_appointments as (
          update appointments
          set
            finished_reviewed_at = $2,
            finished_reviewed_by = $3,
            finished_review_decision = $4,
            updated_at = $2
          where job_id = $1
            and status = 'finished'
            and finished_reviewed_at is null
          returning id
        )
        select count(*) as "reviewedCount"
        from reviewed_appointments
      `,
      [jobId, timelineTime, actorName, decision]
    );
    const reviewedCount = Number(result.rows[0]?.reviewedCount ?? 0);

    if (reviewedCount === 0) {
      return 0;
    }

    await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
    await insertJobTimelineEntry(
      {
        id: randomUUID(),
        jobId,
        occurredAt: timelineTime,
        actorName,
        kind: 'finishedVisitReviewAcknowledged',
        message:
          decision === 'followUpScheduled'
            ? 'Finished visit review acknowledged: follow-up appointment scheduled under this job.'
            : 'Finished visit review acknowledged: job kept open for office follow-up.'
      },
      queryable
    );

    return reviewedCount;
  }

  private async updateJobStatusForAppointmentProgress(
    jobId: string,
    appointmentStatus: AppointmentStatus,
    updatedAt: string,
    queryable: QueryExecutor
  ): Promise<void> {
    let nextStatus: JobStatus | null = null;

    if (
      appointmentStatus === 'scheduled' ||
      appointmentStatus === 'confirmed' ||
      appointmentStatus === 'dispatched'
    ) {
      nextStatus = 'scheduled';
    }

    if (
      appointmentStatus === 'onTheWay' ||
      appointmentStatus === 'arrived' ||
      appointmentStatus === 'working' ||
      appointmentStatus === 'noAnswer' ||
      appointmentStatus === 'finished'
    ) {
      nextStatus = 'inProgress';
    }

    if (!nextStatus) {
      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, updatedAt]);
      return;
    }

    await queryable.query(
      `
        update jobs
        set
          status = case
            when status in ('closed', 'cancelled', 'waitingOnParts', 'completed') then status
            else $2
          end,
          updated_at = $3
        where id = $1
      `,
      [jobId, nextStatus, updatedAt]
    );
  }

  private async getDerivedJobStatus(
    jobId: string,
    queryable: QueryExecutor
  ): Promise<JobStatus | null> {
    const result = await queryable.query<{
      hasScheduledAppointment: boolean;
      hasActiveProgressAppointment: boolean;
    }>(
      `
        select
          exists(
            select 1
            from appointments
            where job_id = $1
              and status in ('scheduled', 'confirmed', 'dispatched')
          ) as "hasScheduledAppointment",
          exists(
            select 1
            from appointments
            where job_id = $1
              and status in ('onTheWay', 'arrived', 'working', 'noAnswer', 'finished')
          ) as "hasActiveProgressAppointment"
      `,
      [jobId]
    );

    const summary = result.rows[0];

    if (!summary) {
      return null;
    }

    if (summary.hasActiveProgressAppointment) {
      return 'inProgress';
    }

    if (summary.hasScheduledAppointment) {
      return 'scheduled';
    }

    return 'new';
  }
}
