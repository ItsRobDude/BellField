import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  AppointmentRecord,
  DispatchAppointmentRecord,
  JobDetailRecord,
  JobRecord,
  JobsQueueCursor,
  JobsQueueKey,
  JobsQueuePageRecord,
  JobTimelineEntry
} from './company-data.types';
import {
  getJobsQueueCondition,
  toAppointmentRecord,
  toDispatchAppointmentRecord,
  toJobsQueueItemRecord,
  toTimelineEntry,
  type AppointmentRow,
  type DispatchAppointmentRow,
  type JobRow,
  type JobsQueueItemRow,
  type JobsQueuePageRow,
  type TimelineRow
} from './jobs-data-row-mappers';

/**
 * Read models for jobs and appointments. Every method here is a non-mutating query; all
 * write paths (and the transactions that own them) live in JobsCommandDataRepository.
 */
@Injectable()
export class JobsReadDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

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

    return result.rows.map((row) => toDispatchAppointmentRecord(row));
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
          where ${getJobsQueueCondition(queueKey)}
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
      jobs: jobRows.map((row) => toJobsQueueItemRecord(row)),
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

    const appointments = appointmentsResult.rows.map((row) => toAppointmentRecord(row));
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
        timeline: timelineRows.map((row) => toTimelineEntry(row)),
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

    return result.rows.map((row) => toAppointmentRecord(row));
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

    return result.rows[0] ? toAppointmentRecord(result.rows[0]) : null;
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
      const appointment = toAppointmentRecord(appointmentRow);
      appointmentsByJobId.set(appointment.jobId, [
        ...(appointmentsByJobId.get(appointment.jobId) ?? []),
        appointment
      ]);
    }

    for (const timelineRow of timelineResult.rows) {
      const entry = toTimelineEntry(timelineRow);
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
}
