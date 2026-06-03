import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import {
  toIsoString,
  toOptionalDateString,
  toOptionalTimeString
} from '../../database/database-row.utils';
import type {
  AppointmentFinishOutcome,
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateJobInput,
  CreateMediaAttachmentInput,
  CreateRegisterEntryInput,
  DispatchAppointmentRecord,
  FinishedVisitReviewDecision,
  JobDetailRecord,
  JobRecord,
  JobStatus,
  JobTimelineEntry,
  JobsQueueCursor,
  JobsQueueItemRecord,
  JobsQueueKey,
  JobsQueuePageRecord,
  MediaAttachmentRecord,
  RegisterEntryRecord,
  UpdateMediaAttachmentCaptionInput,
  UpdateAppointmentScheduleInput,
  UpdateRegisterEntryInput
} from './company-data.types';
import { ensureMainInvoiceDraft } from './jobs-data-repository-utils';
import { JobsMediaDataRepository } from './jobs-media-data.repository';
import { JobsRegisterDataRepository } from './jobs-register-data.repository';
// Cross-module *-utils (allowed by the architecture guard): freeze/supersede the finalized
// job-cost snapshot in the same transaction as the status change, so a completed job's cost
// is frozen atomically and a reopen retires it. The rollup itself lives with job costing.
import {
  freezeJobCostSnapshot,
  supersedeCurrentJobCostSnapshot
} from '../job-costing/job-cost-rollup-utils';

// Job lifecycle phases for the cost-snapshot hook (mirrors jobs-appointments' reopen rule).
const FINAL_JOB_STATUSES: readonly JobStatus[] = ['completed', 'closed', 'cancelled'];
const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  'new',
  'scheduled',
  'inProgress',
  'waitingOnParts'
];

type JobRow = {
  id: string;
  jobNumber: string;
  locationId: string;
  billToCustomerId: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type AppointmentRow = {
  id: string;
  jobId: string;
  scheduledDate: string | Date | null;
  scheduledStartTime: string | Date | null;
  scheduledEndTime: string | Date | null;
  timeWindowLabel: string | null;
  technicianId: string | null;
  status: AppointmentStatus;
  finishOutcome: AppointmentFinishOutcome | null;
  visitNotes: string | null;
  hasChargeActivity: boolean | null;
  registerFollowUpNote: string | null;
  finishedReviewedAt: string | Date | null;
  finishedReviewedBy: string | null;
  finishedReviewDecision: FinishedVisitReviewDecision | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type DispatchAppointmentRow = {
  appointmentId: string;
  jobId: string;
  jobNumber: string;
  jobSummary: string;
  jobStatus: JobStatus;
  jobType: string;
  workOrderNumber: string | null;
  status: AppointmentStatus;
  scheduledDate: string | Date;
  scheduledStartTime: string | Date | null;
  scheduledEndTime: string | Date | null;
  timeWindowLabel: string | null;
  technicianId: string | null;
  technicianName: string | null;
  locationId: string;
  locationName: string;
  locationAddressLine1: string;
  locationCity: string;
  locationState: string;
  billToCustomerId: string;
  billToCustomerName: string;
  customerName: string;
  needsOfficeReview: boolean;
};

type JobsQueueItemRow = {
  id: string;
  jobNumber: string;
  locationId: string;
  locationName: string;
  billToCustomerId: string;
  billToCustomerName: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber: string | null;
  needsScheduling: boolean;
  needsOfficeReview: boolean;
  nextAppointmentId: string | null;
  nextAppointmentJobId: string | null;
  nextAppointmentScheduledDate: string | Date | null;
  nextAppointmentScheduledStartTime: string | Date | null;
  nextAppointmentScheduledEndTime: string | Date | null;
  nextAppointmentTimeWindowLabel: string | null;
  nextAppointmentTechnicianId: string | null;
  nextAppointmentTechnicianName: string | null;
  nextAppointmentStatus: AppointmentStatus | null;
  nextAppointmentNeedsOfficeReview: boolean | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  totalCount: string | number;
};

type JobsQueuePageRow = Partial<JobsQueueItemRow> & {
  totalCount: string | number;
};

type TimelineRow = {
  id: string;
  jobId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: JobTimelineEntry['kind'];
  message: string;
};

type FinishReviewInput = {
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
};

@Injectable()
export class JobsDataRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly registerRepository: JobsRegisterDataRepository,
    private readonly mediaRepository: JobsMediaDataRepository
  ) {}

  async listJobs(): Promise<JobRecord[]> {
    const jobsResult = await this.databaseService.query<JobRow>(
      `
        select
          id,
          job_number as "jobNumber",
          location_id as "locationId",
          bill_to_customer_id as "billToCustomerId",
          job_type as "jobType",
          category,
          origin,
          summary,
          status,
          work_order_number as "workOrderNumber",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from jobs
        order by updated_at desc, job_number asc
      `
    );

    return this.hydrateJobs(jobsResult.rows);
  }

  async listDispatchAppointments(
    startDate: string,
    endDate: string
  ): Promise<DispatchAppointmentRecord[]> {
    const result = await this.databaseService.query<DispatchAppointmentRow>(
      `
        select
          appointment.id as "appointmentId",
          appointment.job_id as "jobId",
          job.job_number as "jobNumber",
          job.summary as "jobSummary",
          job.status as "jobStatus",
          job.job_type as "jobType",
          job.work_order_number as "workOrderNumber",
          appointment.status,
          appointment.scheduled_date as "scheduledDate",
          appointment.scheduled_start_time as "scheduledStartTime",
          appointment.scheduled_end_time as "scheduledEndTime",
          appointment.time_window_label as "timeWindowLabel",
          appointment.technician_id as "technicianId",
          technician.display_name as "technicianName",
          location.id as "locationId",
          location.name as "locationName",
          location.address_line1 as "locationAddressLine1",
          location.city as "locationCity",
          location.state as "locationState",
          bill_to_customer.id as "billToCustomerId",
          bill_to_customer.name as "billToCustomerName",
          owner_customer.name as "customerName",
          (
            job.status not in ('completed', 'closed', 'cancelled')
            and exists (
              select 1
              from appointments review_appointment
              where review_appointment.job_id = job.id
                and review_appointment.status = 'finished'
                and review_appointment.finished_reviewed_at is null
            )
          ) as "needsOfficeReview"
        from appointments appointment
        inner join jobs job on job.id = appointment.job_id
        inner join locations location on location.id = job.location_id
        inner join customers owner_customer on owner_customer.id = location.customer_id
        inner join customers bill_to_customer on bill_to_customer.id = job.bill_to_customer_id
        left join employees technician on technician.id = appointment.technician_id
        where appointment.scheduled_date between $1::date and $2::date
          and appointment.status <> 'cancelled'
          and job.status not in ('closed', 'cancelled')
        order by
          appointment.scheduled_date asc,
          appointment.scheduled_start_time asc nulls last,
          job.job_number asc,
          appointment.created_at asc
      `,
      [startDate, endDate]
    );

    return result.rows.map((row) => this.toDispatchAppointmentRecord(row));
  }

  async listJobsQueuePage(
    queueKey: JobsQueueKey,
    limit: number,
    cursor?: JobsQueueCursor
  ): Promise<JobsQueuePageRecord> {
    const result = await this.databaseService.query<JobsQueuePageRow>(
      `
        with base_jobs as (
          select
            job.id,
            job.job_number,
            job.location_id,
            location.name as location_name,
            job.bill_to_customer_id,
            bill_to_customer.name as bill_to_customer_name,
            job.job_type,
            job.category,
            job.origin,
            job.summary,
            job.status,
            job.work_order_number,
            job.created_at,
            job.updated_at,
            (
              job.status not in ('completed', 'closed', 'cancelled')
              and exists (
                select 1
                from appointments review_appointment
                where review_appointment.job_id = job.id
                  and review_appointment.status = 'finished'
                  and review_appointment.finished_reviewed_at is null
              )
            ) as needs_office_review,
            not exists (
              select 1
              from appointments scheduled_appointment
              where scheduled_appointment.job_id = job.id
                and scheduled_appointment.status <> 'cancelled'
                and scheduled_appointment.scheduled_date is not null
            ) as needs_scheduling
          from jobs job
          inner join locations location on location.id = job.location_id
          inner join customers bill_to_customer on bill_to_customer.id = job.bill_to_customer_id
          where job.status in ('new', 'scheduled', 'inProgress', 'waitingOnParts')
        ),
        queued_jobs as (
          select *
          from base_jobs
          where ${this.getJobsQueueCondition(queueKey)}
        ),
        total_count as (
          select count(*) as total_count
          from queued_jobs
        ),
        page_jobs as (
          select *
          from queued_jobs queued_job
          where (
            $1::timestamptz is null
            or queued_job.updated_at < $1::timestamptz
            or (queued_job.updated_at = $1::timestamptz and queued_job.id > $2::text)
          )
          order by queued_job.updated_at desc, queued_job.id asc
          limit $3
        )
        select
          page_job.id,
          page_job.job_number as "jobNumber",
          page_job.location_id as "locationId",
          page_job.location_name as "locationName",
          page_job.bill_to_customer_id as "billToCustomerId",
          page_job.bill_to_customer_name as "billToCustomerName",
          page_job.job_type as "jobType",
          page_job.category,
          page_job.origin,
          page_job.summary,
          page_job.status,
          page_job.work_order_number as "workOrderNumber",
          page_job.needs_scheduling as "needsScheduling",
          page_job.needs_office_review as "needsOfficeReview",
          next_appointment.id as "nextAppointmentId",
          next_appointment.job_id as "nextAppointmentJobId",
          next_appointment.scheduled_date as "nextAppointmentScheduledDate",
          next_appointment.scheduled_start_time as "nextAppointmentScheduledStartTime",
          next_appointment.scheduled_end_time as "nextAppointmentScheduledEndTime",
          next_appointment.time_window_label as "nextAppointmentTimeWindowLabel",
          next_appointment.technician_id as "nextAppointmentTechnicianId",
          technician.display_name as "nextAppointmentTechnicianName",
          next_appointment.status as "nextAppointmentStatus",
          (
            next_appointment.status = 'finished'
            and next_appointment.finished_reviewed_at is null
            and page_job.status not in ('completed', 'closed', 'cancelled')
          ) as "nextAppointmentNeedsOfficeReview",
          page_job.created_at as "createdAt",
          page_job.updated_at as "updatedAt",
          total_count.total_count as "totalCount"
        from total_count
        left join page_jobs page_job on true
        left join lateral (
          select
            appointment.id,
            appointment.job_id,
            appointment.scheduled_date,
            appointment.scheduled_start_time,
            appointment.scheduled_end_time,
            appointment.time_window_label,
            appointment.technician_id,
            appointment.status,
            appointment.finished_reviewed_at,
            appointment.created_at
          from appointments appointment
          where appointment.job_id = page_job.id
            and appointment.status <> 'cancelled'
          order by appointment.scheduled_date asc nulls last, appointment.scheduled_start_time asc nulls last, appointment.created_at asc
          limit 1
        ) next_appointment on page_job.id is not null
        left join employees technician on technician.id = next_appointment.technician_id
        order by page_job.updated_at desc nulls last, page_job.id asc nulls last
      `,
      [cursor?.updatedAt ?? null, cursor?.id ?? '', limit]
    );
    const jobRows = result.rows.filter((row): row is JobsQueueItemRow => Boolean(row.id));

    return {
      jobs: jobRows.map((row) => this.toJobsQueueItemRecord(row)),
      totalCount: Number(result.rows[0]?.totalCount ?? 0)
    };
  }

  async jobExists(jobId: string): Promise<boolean> {
    const result = await this.databaseService.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from jobs
          where id = $1
        ) as "exists"
      `,
      [jobId]
    );

    return Boolean(result.rows[0]?.exists);
  }

  async listJobsByIds(jobIds: string[]): Promise<JobRecord[]> {
    if (jobIds.length === 0) {
      return [];
    }

    const jobsResult = await this.databaseService.query<JobRow>(
      `
        select
          id,
          job_number as "jobNumber",
          location_id as "locationId",
          bill_to_customer_id as "billToCustomerId",
          job_type as "jobType",
          category,
          origin,
          summary,
          status,
          work_order_number as "workOrderNumber",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from jobs
        where id = any($1::text[])
        order by updated_at desc, job_number asc
      `,
      [jobIds]
    );

    return this.hydrateJobs(jobsResult.rows);
  }

  async getJobById(jobId: string): Promise<JobRecord | null> {
    const result = await this.databaseService.query<JobRow>(
      `
        select
          id,
          job_number as "jobNumber",
          location_id as "locationId",
          bill_to_customer_id as "billToCustomerId",
          job_type as "jobType",
          category,
          origin,
          summary,
          status,
          work_order_number as "workOrderNumber",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from jobs
        where id = $1
        limit 1
      `,
      [jobId]
    );

    if (!result.rows[0]) {
      return null;
    }

    const [job] = await this.hydrateJobs(result.rows);
    return job ?? null;
  }

  async getJobDetailById(jobId: string, timelineLimit: number): Promise<JobDetailRecord | null> {
    const result = await this.databaseService.query<JobRow>(
      `
        select
          id,
          job_number as "jobNumber",
          location_id as "locationId",
          bill_to_customer_id as "billToCustomerId",
          job_type as "jobType",
          category,
          origin,
          summary,
          status,
          work_order_number as "workOrderNumber",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from jobs
        where id = $1
        limit 1
      `,
      [jobId]
    );

    const jobRow = result.rows[0];
    if (!jobRow) {
      return null;
    }

    const [appointmentsResult, timelineResult] = await Promise.all([
      this.databaseService.query<AppointmentRow>(
        `
          select
            id,
            job_id as "jobId",
            scheduled_date as "scheduledDate",
            scheduled_start_time as "scheduledStartTime",
            scheduled_end_time as "scheduledEndTime",
            time_window_label as "timeWindowLabel",
            technician_id as "technicianId",
            status,
            finish_outcome as "finishOutcome",
            visit_notes as "visitNotes",
            has_charge_activity as "hasChargeActivity",
            register_follow_up_note as "registerFollowUpNote",
            finished_reviewed_at as "finishedReviewedAt",
            finished_reviewed_by as "finishedReviewedBy",
            finished_review_decision as "finishedReviewDecision",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from appointments
          where job_id = $1
          order by scheduled_date asc nulls last, scheduled_start_time asc nulls last, time_window_label asc nulls last, created_at asc
        `,
        [jobId]
      ),
      this.databaseService.query<TimelineRow>(
        `
          select
            id,
            job_id as "jobId",
            occurred_at as "occurredAt",
            actor_name as "actorName",
            kind,
            message
          from job_timeline_entries
          where job_id = $1
          order by occurred_at desc, id desc
          limit $2
        `,
        [jobId, timelineLimit + 1]
      )
    ]);

    const appointments = appointmentsResult.rows.map((row) => this.toAppointmentRecord(row));
    const timelineRows = timelineResult.rows.slice(0, timelineLimit).reverse();

    return {
      job: {
        id: jobRow.id,
        jobNumber: jobRow.jobNumber,
        locationId: jobRow.locationId,
        billToCustomerId: jobRow.billToCustomerId,
        jobType: jobRow.jobType,
        category: jobRow.category,
        origin: jobRow.origin,
        summary: jobRow.summary,
        status: jobRow.status,
        workOrderNumber: jobRow.workOrderNumber ?? undefined,
        appointmentIds: appointments.map((appointment) => appointment.id),
        timeline: timelineRows.map((row) => this.toTimelineEntry(row)),
        createdAt: toIsoString(jobRow.createdAt),
        updatedAt: toIsoString(jobRow.updatedAt)
      },
      appointments,
      timelineLimit,
      timelineHasMore: timelineResult.rows.length > timelineLimit
    };
  }

  async listAppointmentsForJob(jobId: string): Promise<AppointmentRecord[]> {
    const result = await this.databaseService.query<AppointmentRow>(
      `
        select
          id,
          job_id as "jobId",
          scheduled_date as "scheduledDate",
          scheduled_start_time as "scheduledStartTime",
          scheduled_end_time as "scheduledEndTime",
          time_window_label as "timeWindowLabel",
          technician_id as "technicianId",
          status,
          finish_outcome as "finishOutcome",
          visit_notes as "visitNotes",
          has_charge_activity as "hasChargeActivity",
          register_follow_up_note as "registerFollowUpNote",
          finished_reviewed_at as "finishedReviewedAt",
          finished_reviewed_by as "finishedReviewedBy",
          finished_review_decision as "finishedReviewDecision",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from appointments
        where job_id = $1
        order by scheduled_date asc nulls last, scheduled_start_time asc nulls last, time_window_label asc nulls last, created_at asc
      `,
      [jobId]
    );

    return result.rows.map((row) => this.toAppointmentRecord(row));
  }

  async getAppointmentById(appointmentId: string): Promise<AppointmentRecord | null> {
    const result = await this.databaseService.query<AppointmentRow>(
      `
        select
          id,
          job_id as "jobId",
          scheduled_date as "scheduledDate",
          scheduled_start_time as "scheduledStartTime",
          scheduled_end_time as "scheduledEndTime",
          time_window_label as "timeWindowLabel",
          technician_id as "technicianId",
          status,
          finish_outcome as "finishOutcome",
          visit_notes as "visitNotes",
          has_charge_activity as "hasChargeActivity",
          register_follow_up_note as "registerFollowUpNote",
          finished_reviewed_at as "finishedReviewedAt",
          finished_reviewed_by as "finishedReviewedBy",
          finished_review_decision as "finishedReviewDecision",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from appointments
        where id = $1
        limit 1
      `,
      [appointmentId]
    );

    return result.rows[0] ? this.toAppointmentRecord(result.rows[0]) : null;
  }

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

      await this.insertTimelineEntry(
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

    const job = await this.getJobById(jobId);

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

      await this.insertTimelineEntry(
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
        if (status === 'completed' && previousStatus !== 'completed') {
          await freezeJobCostSnapshot(queryable, jobId, actorName, timelineTime);
        } else if (
          FINAL_JOB_STATUSES.includes(previousStatus) &&
          ACTIVE_JOB_STATUSES.includes(status)
        ) {
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

        await this.insertTimelineEntry(
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

    return this.getJobById(jobId);
  }

  async createAppointment(
    jobId: string,
    input: CreateAppointmentInput,
    actorName: string,
    occurredAt?: string,
    queryable?: QueryExecutor
  ): Promise<AppointmentRecord> {
    const executor = queryable ?? this.databaseService;
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

    await this.insertTimelineEntry(
      {
        id: randomUUID(),
        jobId,
        occurredAt: timelineTime,
        actorName,
        kind: 'appointmentCreated',
        message: this.buildAppointmentCreatedMessage(appointmentRecord)
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
    const appointment = await this.getAppointmentById(appointmentId);

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

      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId: appointment.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'appointmentScheduleUpdated',
          message: this.buildScheduleUpdateMessage(
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

    return this.getAppointmentById(appointmentId);
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string,
    finishReview?: FinishReviewInput
  ): Promise<AppointmentRecord | null> {
    const appointment = await this.getAppointmentById(appointmentId);

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

      await this.insertTimelineEntry(
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
        await this.insertTimelineEntry(
          {
            id: randomUUID(),
            jobId: appointment.jobId,
            occurredAt: timelineTime,
            actorName,
            kind: 'appointmentFinishedReview',
            message: this.buildFinishReviewMessage(finishReview)
          },
          queryable
        );
      }
    });

    return this.getAppointmentById(appointmentId);
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

    return this.getJobById(jobId);
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
      await this.insertTimelineEntry(
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

    return this.getJobById(jobId);
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
      await this.insertTimelineEntry(
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

    return this.getJobById(jobId);
  }

  async listRegisterEntriesForJob(
    jobId: string,
    includeVoided = false
  ): Promise<RegisterEntryRecord[]> {
    return this.registerRepository.listRegisterEntriesForJob(jobId, includeVoided);
  }

  async getRegisterEntryById(registerEntryId: string): Promise<RegisterEntryRecord | null> {
    return this.registerRepository.getRegisterEntryById(registerEntryId);
  }

  async createRegisterEntry(
    jobId: string,
    input: CreateRegisterEntryInput,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<RegisterEntryRecord> {
    return this.registerRepository.createRegisterEntry(jobId, input, actor, occurredAt);
  }

  async updateRegisterEntry(
    registerEntryId: string,
    input: UpdateRegisterEntryInput,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    return this.registerRepository.updateRegisterEntry(
      registerEntryId,
      input,
      actorName,
      occurredAt
    );
  }

  async voidRegisterEntry(
    registerEntryId: string,
    reason: string | undefined,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    return this.registerRepository.voidRegisterEntry(
      registerEntryId,
      reason,
      actorName,
      occurredAt
    );
  }

  async listMediaAttachmentsForJob(
    jobId: string,
    includeVoided = false
  ): Promise<MediaAttachmentRecord[]> {
    return this.mediaRepository.listMediaAttachmentsForJob(jobId, includeVoided);
  }

  async getMediaAttachmentById(mediaId: string): Promise<MediaAttachmentRecord | null> {
    return this.mediaRepository.getMediaAttachmentById(mediaId);
  }

  async findMediaAttachmentByJobAndSha(
    jobId: string,
    sha256: string
  ): Promise<MediaAttachmentRecord | null> {
    return this.mediaRepository.findMediaAttachmentByJobAndSha(jobId, sha256);
  }

  async createMediaAttachment(
    jobId: string,
    input: CreateMediaAttachmentInput,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord> {
    return this.mediaRepository.createMediaAttachment(jobId, input, occurredAt);
  }

  async markMediaAttachmentBlobUploaded(
    mediaId: string,
    storagePath: string,
    uploadedAt: string
  ): Promise<MediaAttachmentRecord | null> {
    return this.mediaRepository.markMediaAttachmentBlobUploaded(mediaId, storagePath, uploadedAt);
  }

  async updateMediaAttachmentCaption(
    mediaId: string,
    input: UpdateMediaAttachmentCaptionInput,
    actorName: string,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord | null> {
    return this.mediaRepository.updateMediaAttachmentCaption(mediaId, input, actorName, occurredAt);
  }

  async voidMediaAttachment(
    mediaId: string,
    reason: string | undefined,
    actorName: string,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord | null> {
    return this.mediaRepository.voidMediaAttachment(mediaId, reason, actorName, occurredAt);
  }

  async listAssignedJobsForEmployee(
    employeeId: string,
    allowedDates: Set<string>
  ): Promise<JobRecord[]> {
    const allowedDateValues = [...allowedDates];

    if (allowedDateValues.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<{ jobId: string }>(
      `
        select distinct appointment.job_id as "jobId"
        from appointments appointment
        inner join jobs job on job.id = appointment.job_id
        where appointment.technician_id = $1
          and appointment.scheduled_date = any($2::date[])
          and job.status <> 'cancelled'
      `,
      [employeeId, allowedDateValues]
    );

    return this.listJobsByIds(result.rows.map((row) => row.jobId));
  }

  async hasFutureAppointments(jobId: string, referenceDate: string): Promise<boolean> {
    const result = await this.databaseService.query<{ hasFutureAppointment: boolean }>(
      `
        select exists(
          select 1
          from appointments
          where job_id = $1
            and scheduled_date is not null
            and scheduled_date > $2::date
            and status <> 'cancelled'
        ) as "hasFutureAppointment"
      `,
      [jobId, referenceDate]
    );

    return Boolean(result.rows[0]?.hasFutureAppointment);
  }

  async hasCancellableAppointments(jobId: string): Promise<boolean> {
    return (await this.countCancellableAppointments(jobId)) > 0;
  }

  async countCancellableAppointments(jobId: string): Promise<number> {
    const result = await this.databaseService.query<{ appointmentCount: number | string }>(
      `
        select count(*) as "appointmentCount"
        from appointments
        where job_id = $1
          and status <> 'cancelled'
      `,
      [jobId]
    );

    return Number(result.rows[0]?.appointmentCount ?? 0);
  }

  async hasIncompleteAppointments(jobId: string): Promise<boolean> {
    const result = await this.databaseService.query<{ hasIncompleteAppointment: boolean }>(
      `
        select exists(
          select 1
          from appointments
          where job_id = $1
            and status not in ('finished', 'cancelled', 'noAnswer')
        ) as "hasIncompleteAppointment"
      `,
      [jobId]
    );

    return Boolean(result.rows[0]?.hasIncompleteAppointment);
  }

  private async hydrateJobs(jobRows: JobRow[]): Promise<JobRecord[]> {
    if (jobRows.length === 0) {
      return [];
    }

    const jobIds = jobRows.map((row) => row.id);
    const [appointmentsResult, timelineResult] = await Promise.all([
      this.databaseService.query<AppointmentRow>(
        `
          select
            id,
            job_id as "jobId",
            scheduled_date as "scheduledDate",
            scheduled_start_time as "scheduledStartTime",
            scheduled_end_time as "scheduledEndTime",
            time_window_label as "timeWindowLabel",
            technician_id as "technicianId",
            status,
          finish_outcome as "finishOutcome",
          visit_notes as "visitNotes",
          has_charge_activity as "hasChargeActivity",
          register_follow_up_note as "registerFollowUpNote",
          finished_reviewed_at as "finishedReviewedAt",
          finished_reviewed_by as "finishedReviewedBy",
          finished_review_decision as "finishedReviewDecision",
          created_at as "createdAt",
          updated_at as "updatedAt"
          from appointments
          where job_id = any($1::text[])
          order by scheduled_date asc nulls last, scheduled_start_time asc nulls last, time_window_label asc nulls last, created_at asc
        `,
        [jobIds]
      ),
      this.databaseService.query<TimelineRow>(
        `
          select
            id,
            job_id as "jobId",
            occurred_at as "occurredAt",
            actor_name as "actorName",
            kind,
            message
          from job_timeline_entries
          where job_id = any($1::text[])
          order by occurred_at asc, id asc
        `,
        [jobIds]
      )
    ]);

    const appointmentsByJobId = new Map<string, AppointmentRecord[]>();
    const timelineByJobId = new Map<string, JobTimelineEntry[]>();

    for (const appointmentRow of appointmentsResult.rows) {
      const appointment = this.toAppointmentRecord(appointmentRow);
      appointmentsByJobId.set(appointment.jobId, [
        ...(appointmentsByJobId.get(appointment.jobId) ?? []),
        appointment
      ]);
    }

    for (const timelineRow of timelineResult.rows) {
      const entry = this.toTimelineEntry(timelineRow);
      timelineByJobId.set(timelineRow.jobId, [
        ...(timelineByJobId.get(timelineRow.jobId) ?? []),
        entry
      ]);
    }

    return jobRows.map((jobRow) => {
      const appointments = appointmentsByJobId.get(jobRow.id) ?? [];

      return {
        id: jobRow.id,
        jobNumber: jobRow.jobNumber,
        locationId: jobRow.locationId,
        billToCustomerId: jobRow.billToCustomerId,
        jobType: jobRow.jobType,
        category: jobRow.category,
        origin: jobRow.origin,
        summary: jobRow.summary,
        status: jobRow.status,
        workOrderNumber: jobRow.workOrderNumber ?? undefined,
        appointmentIds: appointments.map((appointment) => appointment.id),
        timeline: timelineByJobId.get(jobRow.id) ?? [],
        createdAt: toIsoString(jobRow.createdAt),
        updatedAt: toIsoString(jobRow.updatedAt)
      };
    });
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
    await this.insertTimelineEntry(
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

  private buildScheduleUpdateMessage(
    scheduledDate?: string,
    scheduledStartTime?: string,
    scheduledEndTime?: string,
    timeWindowLabel?: string,
    technicianId?: string
  ): string {
    const parts = ['Appointment scheduling details updated'];

    if (scheduledDate) {
      parts.push(`for ${scheduledDate}`);
    }

    const structuredTime = this.formatStructuredScheduleTime(scheduledStartTime, scheduledEndTime);

    if (structuredTime) {
      parts.push(`from ${structuredTime}`);
    }

    if (timeWindowLabel) {
      parts.push(`during ${timeWindowLabel}`);
    }

    if (technicianId) {
      parts.push('with technician assignment updated');
    }

    return `${parts.join(' ')}.`;
  }

  private buildAppointmentCreatedMessage(appointment: AppointmentRecord): string {
    const parts = ['Appointment added'];

    if (appointment.scheduledDate) {
      parts.push(`for ${appointment.scheduledDate}`);
    }

    const structuredTime = this.formatStructuredScheduleTime(
      appointment.scheduledStartTime,
      appointment.scheduledEndTime
    );

    if (structuredTime) {
      parts.push(`from ${structuredTime}`);
    }

    return `${parts.join(' ')}.`;
  }

  private formatStructuredScheduleTime(
    scheduledStartTime?: string,
    scheduledEndTime?: string
  ): string | undefined {
    if (scheduledStartTime && scheduledEndTime) {
      return `${scheduledStartTime} to ${scheduledEndTime}`;
    }

    if (scheduledStartTime) {
      return `${scheduledStartTime}`;
    }

    if (scheduledEndTime) {
      return `ending ${scheduledEndTime}`;
    }

    return undefined;
  }

  private buildFinishReviewMessage(finishReview?: FinishReviewInput): string {
    const outcome = finishReview?.finishOutcome
      ? `Outcome: ${finishReview.finishOutcome}.`
      : 'Finish review saved.';
    const notesPart = finishReview?.visitNotes?.trim()
      ? ' Visit notes captured.'
      : ' No visit notes captured.';
    const chargePart =
      finishReview?.hasChargeActivity === undefined
        ? ''
        : finishReview.hasChargeActivity
          ? ' Charge activity was reported.'
          : ' No charge activity was reported.';
    const followUpPart = finishReview?.registerFollowUpNote?.trim()
      ? ' Register or follow-up reminder was captured.'
      : '';

    return `${outcome}${notesPart}${chargePart}${followUpPart}`;
  }

  private async insertTimelineEntry(entry: TimelineRow, queryable: QueryExecutor): Promise<void> {
    await queryable.query(
      `
        insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [entry.id, entry.jobId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
    );
  }

  private toAppointmentRecord(row: AppointmentRow): AppointmentRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      scheduledDate: toOptionalDateString(row.scheduledDate),
      scheduledStartTime: toOptionalTimeString(row.scheduledStartTime),
      scheduledEndTime: toOptionalTimeString(row.scheduledEndTime),
      timeWindowLabel: row.timeWindowLabel ?? undefined,
      technicianId: row.technicianId ?? undefined,
      status: row.status,
      finishOutcome: row.finishOutcome ?? undefined,
      visitNotes: row.visitNotes ?? undefined,
      hasChargeActivity: row.hasChargeActivity ?? undefined,
      registerFollowUpNote: row.registerFollowUpNote ?? undefined,
      finishedReviewedAt: row.finishedReviewedAt ? toIsoString(row.finishedReviewedAt) : undefined,
      finishedReviewedBy: row.finishedReviewedBy ?? undefined,
      finishedReviewDecision: row.finishedReviewDecision ?? undefined,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private toDispatchAppointmentRecord(row: DispatchAppointmentRow): DispatchAppointmentRecord {
    return {
      appointmentId: row.appointmentId,
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      jobSummary: row.jobSummary,
      jobStatus: row.jobStatus,
      jobType: row.jobType,
      workOrderNumber: row.workOrderNumber ?? undefined,
      status: row.status,
      scheduledDate: toOptionalDateString(row.scheduledDate) as string,
      scheduledStartTime: toOptionalTimeString(row.scheduledStartTime),
      scheduledEndTime: toOptionalTimeString(row.scheduledEndTime),
      timeWindowLabel: row.timeWindowLabel ?? undefined,
      technicianId: row.technicianId ?? undefined,
      technicianName: row.technicianName ?? undefined,
      locationId: row.locationId,
      locationName: row.locationName,
      locationAddressLine1: row.locationAddressLine1,
      locationCity: row.locationCity,
      locationState: row.locationState,
      billToCustomerId: row.billToCustomerId,
      billToCustomerName: row.billToCustomerName,
      customerName: row.customerName,
      needsOfficeReview: row.needsOfficeReview
    };
  }

  private toJobsQueueItemRecord(row: JobsQueueItemRow): JobsQueueItemRecord {
    return {
      id: row.id,
      jobNumber: row.jobNumber,
      locationId: row.locationId,
      locationName: row.locationName,
      billToCustomerId: row.billToCustomerId,
      billToCustomerName: row.billToCustomerName,
      jobType: row.jobType,
      category: row.category,
      origin: row.origin,
      summary: row.summary,
      status: row.status,
      workOrderNumber: row.workOrderNumber ?? undefined,
      needsScheduling: row.needsScheduling,
      needsOfficeReview: row.needsOfficeReview,
      nextAppointment:
        row.nextAppointmentId && row.nextAppointmentJobId && row.nextAppointmentStatus
          ? {
              id: row.nextAppointmentId,
              jobId: row.nextAppointmentJobId,
              scheduledDate: toOptionalDateString(row.nextAppointmentScheduledDate),
              scheduledStartTime: toOptionalTimeString(row.nextAppointmentScheduledStartTime),
              scheduledEndTime: toOptionalTimeString(row.nextAppointmentScheduledEndTime),
              timeWindowLabel: row.nextAppointmentTimeWindowLabel ?? undefined,
              technicianId: row.nextAppointmentTechnicianId ?? undefined,
              technicianName: row.nextAppointmentTechnicianName ?? undefined,
              status: row.nextAppointmentStatus,
              needsOfficeReview: Boolean(row.nextAppointmentNeedsOfficeReview)
            }
          : undefined,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private getJobsQueueCondition(queueKey: JobsQueueKey): string {
    switch (queueKey) {
      case 'review':
        return 'needs_office_review = true';
      case 'waitingOnParts':
        return "needs_office_review = false and status = 'waitingOnParts'";
      case 'unscheduled':
        return "needs_office_review = false and status <> 'waitingOnParts' and needs_scheduling = true";
      case 'open':
        return "needs_office_review = false and status <> 'waitingOnParts' and needs_scheduling = false";
    }
  }

  private toTimelineEntry(row: TimelineRow): JobTimelineEntry {
    return {
      id: row.id,
      occurredAt: toIsoString(row.occurredAt),
      actorName: row.actorName,
      kind: row.kind,
      message: row.message
    };
  }
}
