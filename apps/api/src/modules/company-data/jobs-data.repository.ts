import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toOptionalDateString, toOptionalTimeString } from '../../database/database-row.utils';
import type {
  AppointmentFinishOutcome,
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateJobInput,
  CreateMediaAttachmentInput,
  FinishedVisitReviewDecision,
  CreateRegisterEntryInput,
  JobRecord,
  JobStatus,
  JobTimelineEntry,
  MediaAttachmentKind,
  MediaAttachmentRecord,
  RegisterEntryKind,
  RegisterEntryRecord,
  UpdateMediaAttachmentCaptionInput,
  UpdateRegisterEntryInput,
  UpdateAppointmentScheduleInput
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

type TimelineRow = {
  id: string;
  jobId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: JobTimelineEntry['kind'];
  message: string;
};

type RegisterEntryRow = {
  id: string;
  jobId: string;
  appointmentId: string | null;
  kind: RegisterEntryKind;
  description: string;
  quantity: string | number;
  unitOfMeasure: string | null;
  unitPrice: string | number | null;
  totalAmount: string | number;
  partNumber: string | null;
  inventorySourceLabel: string | null;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string | Date;
  isVoid: boolean;
  voidReason: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type MediaAttachmentRow = {
  id: string;
  jobId: string;
  appointmentId: string | null;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: string | number;
  sha256: string;
  originalFilename: string;
  caption: string | null;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string | Date;
  storagePath: string | null;
  uploadedAt: string | Date | null;
  isVoid: boolean;
  voidReason: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type FinishReviewInput = {
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
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
        order by updated_at desc, job_number asc
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

  async createJob(input: CreateJobInput, actorName: string, resolvedBillToCustomerId: string, locationName: string): Promise<JobRecord> {
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
      scheduledStartTime: input.scheduledDate ? input.scheduledStartTime?.trim() || undefined : undefined,
      scheduledEndTime: input.scheduledDate ? input.scheduledEndTime?.trim() || undefined : undefined,
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
    const nextScheduledStartTime = nextScheduledDate ? input.scheduledStartTime?.trim() || null : null;
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
          isFinishedStatus ? finishReview?.finishOutcome ?? null : null,
          isFinishedStatus ? finishReview?.visitNotes?.trim() || null : null,
          isFinishedStatus ? finishReview?.hasChargeActivity ?? null : null,
          isFinishedStatus ? finishReview?.registerFollowUpNote?.trim() || null : null,
          timelineTime
        ]
      );

      await this.updateJobStatusForAppointmentProgress(appointment.jobId, status, timelineTime, queryable);

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
      await this.acknowledgeUnreviewedFinishedAppointments(jobId, decision, actorName, timelineTime, queryable);
    });

    return this.getJobById(jobId);
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

  async listRegisterEntriesForJob(jobId: string, includeVoided = false): Promise<RegisterEntryRecord[]> {
    const result = await this.databaseService.query<RegisterEntryRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          description,
          quantity,
          unit_of_measure as "unitOfMeasure",
          unit_price as "unitPrice",
          total_amount as "totalAmount",
          part_number as "partNumber",
          inventory_source_label as "inventorySourceLabel",
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from register_entries
        where job_id = $1
          and ($2::boolean = true or is_void = false)
        order by captured_at asc, created_at asc, id asc
      `,
      [jobId, includeVoided]
    );

    return result.rows.map((row) => this.toRegisterEntryRecord(row));
  }

  async getRegisterEntryById(registerEntryId: string): Promise<RegisterEntryRecord | null> {
    const result = await this.databaseService.query<RegisterEntryRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          description,
          quantity,
          unit_of_measure as "unitOfMeasure",
          unit_price as "unitPrice",
          total_amount as "totalAmount",
          part_number as "partNumber",
          inventory_source_label as "inventorySourceLabel",
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from register_entries
        where id = $1
        limit 1
      `,
      [registerEntryId]
    );

    return result.rows[0] ? this.toRegisterEntryRecord(result.rows[0]) : null;
  }

  async createRegisterEntry(
    jobId: string,
    input: CreateRegisterEntryInput,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<RegisterEntryRecord> {
    const timelineTime = occurredAt || new Date().toISOString();
    const registerEntryId = randomUUID();

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          insert into register_entries (
            id,
            job_id,
            appointment_id,
            kind,
            description,
            quantity,
            unit_of_measure,
            unit_price,
            total_amount,
            part_number,
            inventory_source_label,
            captured_by_employee_id,
            captured_by_name,
            captured_at,
            is_void,
            void_reason,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, null, $15, $16)
        `,
        [
          registerEntryId,
          jobId,
          input.appointmentId ?? null,
          input.kind,
          input.description.trim(),
          input.quantity,
          input.unitOfMeasure?.trim() || null,
          input.unitPrice ?? null,
          input.totalAmount,
          input.partNumber?.trim() || null,
          input.inventorySourceLabel?.trim() || null,
          actor.id,
          actor.displayName,
          timelineTime,
          timelineTime,
          timelineTime
        ]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: timelineTime,
          actorName: actor.displayName,
          kind: 'registerEntryAdded',
          message: `Register entry added: ${input.description.trim()}.`
        },
        queryable
      );
    });

    const registerEntry = await this.getRegisterEntryById(registerEntryId);

    if (!registerEntry) {
      throw new Error('Created register entry could not be loaded.');
    }

    return registerEntry;
  }

  async updateRegisterEntry(
    registerEntryId: string,
    input: UpdateRegisterEntryInput,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    const existingEntry = await this.getRegisterEntryById(registerEntryId);

    if (!existingEntry) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const nextEntry: RegisterEntryRecord = {
      ...existingEntry,
      appointmentId:
        input.appointmentId !== undefined ? input.appointmentId?.trim() || undefined : existingEntry.appointmentId,
      kind: input.kind ?? existingEntry.kind,
      description: input.description !== undefined ? input.description.trim() : existingEntry.description,
      quantity: input.quantity ?? existingEntry.quantity,
      unitOfMeasure: input.unitOfMeasure !== undefined ? input.unitOfMeasure.trim() || undefined : existingEntry.unitOfMeasure,
      unitPrice: input.unitPrice !== undefined ? input.unitPrice ?? undefined : existingEntry.unitPrice,
      totalAmount: input.totalAmount ?? existingEntry.totalAmount,
      partNumber: input.partNumber !== undefined ? input.partNumber.trim() || undefined : existingEntry.partNumber,
      inventorySourceLabel:
        input.inventorySourceLabel !== undefined
          ? input.inventorySourceLabel.trim() || undefined
          : existingEntry.inventorySourceLabel,
      updatedAt: timelineTime
    };

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update register_entries
          set
            appointment_id = $2,
            kind = $3,
            description = $4,
            quantity = $5,
            unit_of_measure = $6,
            unit_price = $7,
            total_amount = $8,
            part_number = $9,
            inventory_source_label = $10,
            updated_at = $11
          where id = $1
        `,
        [
          registerEntryId,
          nextEntry.appointmentId ?? null,
          nextEntry.kind,
          nextEntry.description,
          nextEntry.quantity,
          nextEntry.unitOfMeasure ?? null,
          nextEntry.unitPrice ?? null,
          nextEntry.totalAmount,
          nextEntry.partNumber ?? null,
          nextEntry.inventorySourceLabel ?? null,
          timelineTime
        ]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [existingEntry.jobId, timelineTime]);
      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId: existingEntry.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'registerEntryEdited',
          message: `Register entry edited: ${nextEntry.description}.`
        },
        queryable
      );
    });

    return this.getRegisterEntryById(registerEntryId);
  }

  async voidRegisterEntry(
    registerEntryId: string,
    reason: string | undefined,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    const existingEntry = await this.getRegisterEntryById(registerEntryId);

    if (!existingEntry) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const trimmedReason = reason?.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update register_entries
          set
            is_void = true,
            void_reason = $2,
            updated_at = $3
          where id = $1
        `,
        [registerEntryId, trimmedReason, timelineTime]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [existingEntry.jobId, timelineTime]);
      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId: existingEntry.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'registerEntryVoided',
          message: this.buildRegisterEntryVoidedMessage(existingEntry.description, trimmedReason)
        },
        queryable
      );
    });

    return this.getRegisterEntryById(registerEntryId);
  }

  async listMediaAttachmentsForJob(jobId: string, includeVoided = false): Promise<MediaAttachmentRecord[]> {
    const result = await this.databaseService.query<MediaAttachmentRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          content_type as "contentType",
          byte_size as "byteSize",
          sha256,
          original_filename as "originalFilename",
          caption,
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          storage_path as "storagePath",
          uploaded_at as "uploadedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from media_attachments
        where job_id = $1
          and ($2::boolean = true or is_void = false)
        order by captured_at asc, created_at asc, id asc
      `,
      [jobId, includeVoided]
    );

    return result.rows.map((row) => this.toMediaAttachmentRecord(row));
  }

  async getMediaAttachmentById(mediaId: string): Promise<MediaAttachmentRecord | null> {
    const result = await this.databaseService.query<MediaAttachmentRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          content_type as "contentType",
          byte_size as "byteSize",
          sha256,
          original_filename as "originalFilename",
          caption,
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          storage_path as "storagePath",
          uploaded_at as "uploadedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from media_attachments
        where id = $1
        limit 1
      `,
      [mediaId]
    );

    return result.rows[0] ? this.toMediaAttachmentRecord(result.rows[0]) : null;
  }

  async findMediaAttachmentByJobAndSha(jobId: string, sha256: string): Promise<MediaAttachmentRecord | null> {
    const result = await this.databaseService.query<MediaAttachmentRow>(
      `
        select
          id,
          job_id as "jobId",
          appointment_id as "appointmentId",
          kind,
          content_type as "contentType",
          byte_size as "byteSize",
          sha256,
          original_filename as "originalFilename",
          caption,
          captured_by_employee_id as "capturedByEmployeeId",
          captured_by_name as "capturedByName",
          captured_at as "capturedAt",
          storage_path as "storagePath",
          uploaded_at as "uploadedAt",
          is_void as "isVoid",
          void_reason as "voidReason",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from media_attachments
        where job_id = $1 and sha256 = $2
        limit 1
      `,
      [jobId, sha256]
    );

    return result.rows[0] ? this.toMediaAttachmentRecord(result.rows[0]) : null;
  }

  async createMediaAttachment(
    jobId: string,
    input: CreateMediaAttachmentInput,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord> {
    const timelineTime = occurredAt || new Date().toISOString();
    const mediaId = randomUUID();

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          insert into media_attachments (
            id,
            job_id,
            appointment_id,
            kind,
            content_type,
            byte_size,
            sha256,
            original_filename,
            caption,
            captured_by_employee_id,
            captured_by_name,
            captured_at,
            storage_path,
            uploaded_at,
            is_void,
            void_reason,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, null, null, false, null, $13, $14)
        `,
        [
          mediaId,
          jobId,
          input.appointmentId ?? null,
          input.kind,
          input.contentType,
          input.byteSize,
          input.sha256,
          input.originalFilename.trim(),
          input.caption?.trim() || null,
          input.capturedByEmployeeId,
          input.capturedByName,
          input.capturedAt,
          timelineTime,
          timelineTime
        ]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, timelineTime]);
      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: timelineTime,
          actorName: input.capturedByName,
          kind: 'mediaAttached',
          message: `${input.capturedByName} attached ${input.originalFilename.trim()}.`
        },
        queryable
      );
    });

    const mediaAttachment = await this.getMediaAttachmentById(mediaId);

    if (!mediaAttachment) {
      throw new Error('Created media attachment could not be loaded.');
    }

    return mediaAttachment;
  }

  async markMediaAttachmentBlobUploaded(
    mediaId: string,
    storagePath: string,
    uploadedAt: string
  ): Promise<MediaAttachmentRecord | null> {
    await this.databaseService.query(
      `
        update media_attachments
        set
          storage_path = $2,
          uploaded_at = $3,
          updated_at = $3
        where id = $1
      `,
      [mediaId, storagePath, uploadedAt]
    );

    return this.getMediaAttachmentById(mediaId);
  }

  async updateMediaAttachmentCaption(
    mediaId: string,
    input: UpdateMediaAttachmentCaptionInput,
    actorName: string,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord | null> {
    const existing = await this.getMediaAttachmentById(mediaId);

    if (!existing) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const trimmedCaption = input.caption === null ? null : input.caption.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update media_attachments
          set
            caption = $2,
            updated_at = $3
          where id = $1
        `,
        [mediaId, trimmedCaption, timelineTime]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [existing.jobId, timelineTime]);
      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId: existing.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'mediaCaptionEdited',
          message: this.buildMediaCaptionMessage(existing.originalFilename, trimmedCaption)
        },
        queryable
      );
    });

    return this.getMediaAttachmentById(mediaId);
  }

  async voidMediaAttachment(
    mediaId: string,
    reason: string | undefined,
    actorName: string,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord | null> {
    const existing = await this.getMediaAttachmentById(mediaId);

    if (!existing) {
      return null;
    }

    const timelineTime = occurredAt || new Date().toISOString();
    const trimmedReason = reason?.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          update media_attachments
          set
            is_void = true,
            void_reason = $2,
            updated_at = $3
          where id = $1
        `,
        [mediaId, trimmedReason, timelineTime]
      );

      await queryable.query('update jobs set updated_at = $2 where id = $1', [existing.jobId, timelineTime]);
      await this.insertTimelineEntry(
        {
          id: randomUUID(),
          jobId: existing.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'mediaVoided',
          message: this.buildMediaVoidedMessage(existing.originalFilename, trimmedReason)
        },
        queryable
      );
    });

    return this.getMediaAttachmentById(mediaId);
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

    if (appointmentStatus === 'scheduled' || appointmentStatus === 'confirmed' || appointmentStatus === 'dispatched') {
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

  private async getDerivedJobStatus(jobId: string, queryable: QueryExecutor): Promise<JobStatus | null> {
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

  private formatStructuredScheduleTime(scheduledStartTime?: string, scheduledEndTime?: string): string | undefined {
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
    const outcome = finishReview?.finishOutcome ? `Outcome: ${finishReview.finishOutcome}.` : 'Finish review saved.';
    const notesPart = finishReview?.visitNotes?.trim() ? ' Visit notes captured.' : ' No visit notes captured.';
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

  private buildRegisterEntryVoidedMessage(description: string, reason: string | null): string {
    if (!reason) {
      return `Register entry voided: ${description}.`;
    }

    return `Register entry voided: ${description}. Reason: ${reason}${reason.endsWith('.') ? '' : '.'}`;
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

  private buildMediaCaptionMessage(filename: string, caption: string | null): string {
    if (!caption) {
      return `Caption cleared on ${filename}.`;
    }
    return `Caption updated on ${filename}: ${caption}`;
  }

  private buildMediaVoidedMessage(filename: string, reason: string | null): string {
    if (reason) {
      return `${filename} voided (reason: ${reason}).`;
    }
    return `${filename} voided.`;
  }

  private toMediaAttachmentRecord(row: MediaAttachmentRow): MediaAttachmentRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      appointmentId: row.appointmentId ?? undefined,
      kind: row.kind,
      contentType: row.contentType,
      byteSize: Number(row.byteSize),
      sha256: row.sha256,
      originalFilename: row.originalFilename,
      caption: row.caption ?? undefined,
      capturedByEmployeeId: row.capturedByEmployeeId,
      capturedByName: row.capturedByName,
      capturedAt: toIsoString(row.capturedAt),
      storagePath: row.storagePath ?? undefined,
      uploadedAt: row.uploadedAt ? toIsoString(row.uploadedAt) : undefined,
      isVoid: row.isVoid,
      voidReason: row.voidReason ?? undefined,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private toRegisterEntryRecord(row: RegisterEntryRow): RegisterEntryRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      appointmentId: row.appointmentId ?? undefined,
      kind: row.kind,
      description: row.description,
      quantity: Number(row.quantity),
      unitOfMeasure: row.unitOfMeasure ?? undefined,
      unitPrice: row.unitPrice === null ? undefined : Number(row.unitPrice),
      totalAmount: Number(row.totalAmount),
      partNumber: row.partNumber ?? undefined,
      inventorySourceLabel: row.inventorySourceLabel ?? undefined,
      capturedByEmployeeId: row.capturedByEmployeeId,
      capturedByName: row.capturedByName,
      capturedAt: toIsoString(row.capturedAt),
      isVoid: row.isVoid,
      voidReason: row.voidReason ?? undefined,
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
