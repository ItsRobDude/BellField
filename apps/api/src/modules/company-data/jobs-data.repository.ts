import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toOptionalDateString } from '../../database/database-row.utils';
import type {
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateJobInput,
  JobRecord,
  JobStatus,
  JobTimelineEntry
} from './company-data.types';

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
  timeWindowLabel: string | null;
  technicianId: string | null;
  status: AppointmentStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type TimelineRow = {
  id: string;
  jobId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: JobTimelineEntry['kind'];
  message: string;
};

@Injectable()
export class JobsDataRepository {
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
        order by job_number asc
      `
    );

    return this.hydrateJobs(jobsResult.rows);
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
        order by job_number asc
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

  async listAppointmentsForJob(jobId: string): Promise<AppointmentRecord[]> {
    const result = await this.databaseService.query<AppointmentRow>(
      `
        select
          id,
          job_id as "jobId",
          scheduled_date as "scheduledDate",
          time_window_label as "timeWindowLabel",
          technician_id as "technicianId",
          status,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from appointments
        where job_id = $1
        order by scheduled_date asc nulls last, time_window_label asc nulls last, created_at asc
      `,
      [jobId]
    );

    return result.rows.map((row: AppointmentRow) => this.toAppointmentRecord(row));
  }

  async getAppointmentById(appointmentId: string): Promise<AppointmentRecord | null> {
    const result = await this.databaseService.query<AppointmentRow>(
      `
        select
          id,
          job_id as "jobId",
          scheduled_date as "scheduledDate",
          time_window_label as "timeWindowLabel",
          technician_id as "technicianId",
          status,
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

  async createJob(input: CreateJobInput, actorName: string, resolvedBillToCustomerId: string, locationName: string): Promise<JobRecord> {
    const now = new Date().toISOString();
    const jobId = randomUUID();

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
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11)
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
          input.workOrderNumber?.trim() || `WO-${jobNumber}`,
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
          message: `Job ${jobNumber} created for ${locationName}.`
        },
        queryable
      );

      if (input.scheduledDate || input.timeWindowLabel || input.technicianId) {
        await this.createAppointment(jobId, input, actorName, now, queryable);
      }
    });

    const job = await this.getJobById(jobId);

    if (!job) {
      throw new Error('Created job could not be loaded.');
    }

    return job;
  }

  async updateJobStatus(jobId: string, status: JobStatus, actorName: string, occurredAt?: string): Promise<JobRecord | null> {
    const timelineTime = occurredAt || new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
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

      if (status === 'cancelled') {
        await queryable.query(
          `
            update appointments
            set status = 'cancelled', updated_at = $2
            where job_id = $1
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
            message: 'All appointments under the job were cancelled with the job.'
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
      timeWindowLabel: input.timeWindowLabel?.trim() || undefined,
      technicianId: input.technicianId?.trim() || undefined,
      status: 'assigned',
      createdAt: timelineTime,
      updatedAt: timelineTime
    };

    await executor.query(
      `
        insert into appointments (
          id,
          job_id,
          scheduled_date,
          time_window_label,
          technician_id,
          status,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, 'assigned', $6, $7)
      `,
      [
        appointmentRecord.id,
        appointmentRecord.jobId,
        appointmentRecord.scheduledDate ?? null,
        appointmentRecord.timeWindowLabel ?? null,
        appointmentRecord.technicianId ?? null,
        appointmentRecord.createdAt,
        appointmentRecord.updatedAt
      ]
    );

    await executor.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);

    await this.insertTimelineEntry(
      {
        id: randomUUID(),
        jobId,
        occurredAt: timelineTime,
        actorName,
        kind: 'appointmentCreated',
        message: `Appointment added${appointmentRecord.scheduledDate ? ` for ${appointmentRecord.scheduledDate}` : ''}.`
      },
      executor
    );

    return appointmentRecord;
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string
  ): Promise<AppointmentRecord | null> {
    const appointment = await this.getAppointmentById(appointmentId);

    if (!appointment) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update appointments
          set status = $2, updated_at = $3
          where id = $1
        `,
        [appointmentId, status, timelineTime]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [appointment.jobId, timelineTime]);

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
    });

    return this.getAppointmentById(appointmentId);
  }

  async addJobNote(jobId: string, noteBody: string, actorName: string, occurredAt?: string): Promise<JobRecord | null> {
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

  async addSyncFlag(jobId: string, message: string, actorName: string, occurredAt?: string): Promise<JobRecord | null> {
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

  async listAssignedJobsForEmployee(employeeId: string, allowedDates: Set<string>): Promise<JobRecord[]> {
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

    return this.listJobsByIds(result.rows.map((row: { jobId: string }) => row.jobId));
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
            time_window_label as "timeWindowLabel",
            technician_id as "technicianId",
            status,
            created_at as "createdAt",
            updated_at as "updatedAt"
          from appointments
          where job_id = any($1::text[])
          order by scheduled_date asc nulls last, time_window_label asc nulls last, created_at asc
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
      appointmentsByJobId.set(appointment.jobId, [...(appointmentsByJobId.get(appointment.jobId) ?? []), appointment]);
    }

    for (const timelineRow of timelineResult.rows) {
      const entry = this.toTimelineEntry(timelineRow);
      timelineByJobId.set(timelineRow.jobId, [...(timelineByJobId.get(timelineRow.jobId) ?? []), entry]);
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
      timeWindowLabel: row.timeWindowLabel ?? undefined,
      technicianId: row.technicianId ?? undefined,
      status: row.status,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
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
