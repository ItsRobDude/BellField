import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AppointmentFinishOutcome,
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  FinishedVisitReviewDecision,
  CreateJobInput,
  JobRecord,
  JobStatus
} from './company-data.types';
import type { UpdateAppointmentScheduleInput } from './company-data.types';
import { JobsDataRepository } from './jobs-data.repository';

@Injectable()
export class JobsDataService {
  constructor(private readonly jobsDataRepository: JobsDataRepository) {}

  async listJobs(): Promise<JobRecord[]> {
    return this.jobsDataRepository.listJobs();
  }

  async getJobById(jobId: string): Promise<JobRecord> {
    const job = await this.jobsDataRepository.getJobById(jobId);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async listAppointmentsForJob(jobId: string): Promise<AppointmentRecord[]> {
    return this.jobsDataRepository.listAppointmentsForJob(jobId);
  }

  async createJob(
    input: CreateJobInput,
    actorName: string,
    resolvedBillToCustomerId: string,
    locationName: string
  ): Promise<JobRecord> {
    return this.jobsDataRepository.createJob(input, actorName, resolvedBillToCustomerId, locationName);
  }

  async updateJobStatus(jobId: string, status: JobStatus, actorName: string, occurredAt?: string): Promise<JobRecord> {
    const job = await this.jobsDataRepository.updateJobStatus(jobId, status, actorName, occurredAt);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async createAppointment(
    jobId: string,
    input: CreateAppointmentInput,
    actorName: string,
    occurredAt?: string
  ): Promise<AppointmentRecord> {
    return this.jobsDataRepository.createAppointment(jobId, input, actorName, occurredAt);
  }

  async acknowledgeFinishedVisitReview(
    jobId: string,
    decision: FinishedVisitReviewDecision,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord> {
    const job = await this.jobsDataRepository.acknowledgeFinishedVisitReview(jobId, decision, actorName, occurredAt);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async updateAppointmentSchedule(
    appointmentId: string,
    input: UpdateAppointmentScheduleInput,
    actorName: string,
    occurredAt?: string
  ): Promise<AppointmentRecord> {
    const appointment = await this.jobsDataRepository.updateAppointmentSchedule(
      appointmentId,
      input,
      actorName,
      occurredAt
    );

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    return appointment;
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string,
    finishReview?: {
      finishOutcome?: AppointmentFinishOutcome;
      visitNotes?: string;
      hasChargeActivity?: boolean;
      registerFollowUpNote?: string;
    }
  ): Promise<AppointmentRecord> {
    const appointment = await this.jobsDataRepository.updateAppointmentStatus(
      appointmentId,
      status,
      actorName,
      occurredAt,
      finishReview
    );

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    return appointment;
  }

  async addJobNote(jobId: string, noteBody: string, actorName: string, occurredAt?: string): Promise<JobRecord> {
    const job = await this.jobsDataRepository.addJobNote(jobId, noteBody, actorName, occurredAt);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async addSyncFlag(jobId: string, message: string, actorName: string, occurredAt?: string): Promise<JobRecord> {
    const job = await this.jobsDataRepository.addSyncFlag(jobId, message, actorName, occurredAt);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async getAppointmentById(appointmentId: string): Promise<AppointmentRecord> {
    const appointment = await this.jobsDataRepository.getAppointmentById(appointmentId);

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    return appointment;
  }

  async listAssignedJobsForEmployee(employeeId: string, allowedDates: Set<string>): Promise<JobRecord[]> {
    return this.jobsDataRepository.listAssignedJobsForEmployee(employeeId, allowedDates);
  }

  async hasFutureAppointments(jobId: string, referenceDate: string): Promise<boolean> {
    return this.jobsDataRepository.hasFutureAppointments(jobId, referenceDate);
  }

  async hasCancellableAppointments(jobId: string): Promise<boolean> {
    return this.jobsDataRepository.hasCancellableAppointments(jobId);
  }

  async countCancellableAppointments(jobId: string): Promise<number> {
    return this.jobsDataRepository.countCancellableAppointments(jobId);
  }

  async hasIncompleteAppointments(jobId: string): Promise<boolean> {
    return this.jobsDataRepository.hasIncompleteAppointments(jobId);
  }
}
