import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateJobInput,
  JobRecord,
  JobStatus,
  JobTimelineEntry
} from './company-data.types';
import { seededAppointments, seededJobs } from './seed-company-data';

@Injectable()
export class JobsDataService {
  private readonly jobs = new Map<string, JobRecord>(seededJobs.map((job) => [job.id, structuredClone(job)]));

  private readonly appointments = new Map<string, AppointmentRecord>(
    seededAppointments.map((appointment) => [appointment.id, structuredClone(appointment)])
  );

  private jobNumberCounter = 1003;

  listJobs(): JobRecord[] {
    return [...this.jobs.values()].sort((left, right) => left.jobNumber.localeCompare(right.jobNumber));
  }

  getJobById(jobId: string): JobRecord {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  listAppointmentsForJob(jobId: string): AppointmentRecord[] {
    return [...this.appointments.values()]
      .filter((appointment) => appointment.jobId === jobId)
      .sort((left, right) =>
        `${left.scheduledDate ?? ''}${left.timeWindowLabel ?? ''}`.localeCompare(
          `${right.scheduledDate ?? ''}${right.timeWindowLabel ?? ''}`
        )
      );
  }

  createJob(input: CreateJobInput, actorName: string, resolvedBillToCustomerId: string, locationName: string): JobRecord {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const jobNumber = String(this.jobNumberCounter++);
    const jobRecord: JobRecord = {
      id: jobId,
      jobNumber,
      locationId: input.locationId,
      billToCustomerId: resolvedBillToCustomerId,
      jobType: input.jobType.trim(),
      category: input.category.trim(),
      origin: input.origin.trim(),
      summary: input.summary.trim(),
      status: 'open',
      workOrderNumber: input.workOrderNumber?.trim() || `WO-${jobNumber}`,
      appointmentIds: [],
      timeline: [
        {
          id: randomUUID(),
          occurredAt: now,
          actorName,
          kind: 'jobCreated',
          message: `Job ${jobNumber} created for ${locationName}.`
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(jobId, jobRecord);

    if (input.scheduledDate || input.timeWindowLabel || input.technicianId) {
      this.createAppointment(
        jobId,
        {
          scheduledDate: input.scheduledDate,
          timeWindowLabel: input.timeWindowLabel,
          technicianId: input.technicianId
        },
        actorName
      );
    }

    return this.getJobById(jobId);
  }

  updateJobStatus(jobId: string, status: JobStatus, actorName: string, occurredAt?: string): JobRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();

    job.status = status;
    job.updatedAt = timelineTime;

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'jobStatusUpdated',
      message: `Job status changed to ${status}.`
    });

    if (status === 'cancelled') {
      for (const appointment of this.listAppointmentsForJob(jobId)) {
        appointment.status = 'cancelled';
        appointment.updatedAt = timelineTime;
        this.appointments.set(appointment.id, appointment);
      }
    }

    this.jobs.set(job.id, job);
    return job;
  }

  createAppointment(jobId: string, input: CreateAppointmentInput, actorName: string, occurredAt?: string): AppointmentRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();
    const appointment: AppointmentRecord = {
      id: randomUUID(),
      jobId,
      scheduledDate: input.scheduledDate?.trim() || undefined,
      timeWindowLabel: input.timeWindowLabel?.trim() || undefined,
      technicianId: input.technicianId?.trim() || undefined,
      status: 'assigned',
      createdAt: timelineTime,
      updatedAt: timelineTime
    };

    this.appointments.set(appointment.id, appointment);
    job.appointmentIds.push(appointment.id);
    job.updatedAt = timelineTime;

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'appointmentCreated',
      message: `Appointment added${appointment.scheduledDate ? ` for ${appointment.scheduledDate}` : ''}.`
    });

    this.jobs.set(job.id, job);
    return appointment;
  }

  updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string
  ): AppointmentRecord {
    const appointment = this.getAppointmentById(appointmentId);
    const timelineTime = occurredAt || new Date().toISOString();
    appointment.status = status;
    appointment.updatedAt = timelineTime;
    this.appointments.set(appointment.id, appointment);

    const job = this.getJobById(appointment.jobId);
    job.updatedAt = timelineTime;

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'appointmentStatusUpdated',
      message: `Appointment status changed to ${status}.`
    });

    this.jobs.set(job.id, job);
    return appointment;
  }

  addJobNote(jobId: string, noteBody: string, actorName: string, occurredAt?: string): JobRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'jobNote',
      message: noteBody.trim()
    });

    job.updatedAt = timelineTime;
    this.jobs.set(job.id, job);
    return job;
  }

  addSyncFlag(jobId: string, message: string, actorName: string, occurredAt?: string): JobRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'syncFlag',
      message
    });

    job.updatedAt = timelineTime;
    this.jobs.set(job.id, job);
    return job;
  }

  getAppointmentById(appointmentId: string): AppointmentRecord {
    const appointment = this.appointments.get(appointmentId);

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    return appointment;
  }

  listAssignedJobsForEmployee(employeeId: string, allowedDates: Set<string>): JobRecord[] {
    const assignedJobIds = new Set(
      [...this.appointments.values()]
        .filter(
          (appointment) =>
            appointment.technicianId === employeeId &&
            (!appointment.scheduledDate || allowedDates.has(appointment.scheduledDate))
        )
        .map((appointment) => appointment.jobId)
    );

    return this.listJobs().filter((job) => assignedJobIds.has(job.id) && job.status !== 'cancelled');
  }

  private addTimelineEntry(job: JobRecord, entry: JobTimelineEntry): void {
    job.timeline = [...job.timeline, entry].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }
}
