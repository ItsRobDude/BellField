import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AppointmentFinishOutcome,
  AppointmentRecord,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateMediaAttachmentInput,
  DispatchAppointmentRecord,
  FinishedVisitReviewDecision,
  CreateJobInput,
  JobDetailRecord,
  JobRecord,
  JobStatus,
  JobsQueueCursor,
  JobsQueueKey,
  JobsQueuePageRecord,
  MediaAttachmentRecord,
  RegisterEntryRecord,
  CreateRegisterEntryInput,
  UpdateMediaAttachmentCaptionInput,
  UpdateRegisterEntryInput
} from './company-data.types';
import type { UpdateAppointmentScheduleInput } from './company-data.types';
import { JobsDataRepository } from './jobs-data.repository';

@Injectable()
export class JobsDataService {
  constructor(private readonly jobsDataRepository: JobsDataRepository) {}

  async listJobs(): Promise<JobRecord[]> {
    return this.jobsDataRepository.listJobs();
  }

  async listDispatchAppointments(
    startDate: string,
    endDate: string
  ): Promise<DispatchAppointmentRecord[]> {
    return this.jobsDataRepository.listDispatchAppointments(startDate, endDate);
  }

  async listJobsQueuePage(
    queueKey: JobsQueueKey,
    limit: number,
    cursor?: JobsQueueCursor
  ): Promise<JobsQueuePageRecord> {
    return this.jobsDataRepository.listJobsQueuePage(queueKey, limit, cursor);
  }

  async getJobById(jobId: string): Promise<JobRecord> {
    const job = await this.jobsDataRepository.getJobById(jobId);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async getJobDetailById(jobId: string, timelineLimit: number): Promise<JobDetailRecord> {
    const detail = await this.jobsDataRepository.getJobDetailById(jobId, timelineLimit);

    if (!detail) {
      throw new NotFoundException('Job not found.');
    }

    return detail;
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
    return this.jobsDataRepository.createJob(
      input,
      actorName,
      resolvedBillToCustomerId,
      locationName
    );
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    actorName: string,
    occurredAt?: string,
    expectedCurrentStatus?: JobStatus
  ): Promise<JobRecord> {
    const job = await this.jobsDataRepository.updateJobStatus(
      jobId,
      status,
      actorName,
      occurredAt,
      expectedCurrentStatus
    );

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
    const job = await this.jobsDataRepository.acknowledgeFinishedVisitReview(
      jobId,
      decision,
      actorName,
      occurredAt
    );

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

  async addJobNote(
    jobId: string,
    noteBody: string,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord> {
    const job = await this.jobsDataRepository.addJobNote(jobId, noteBody, actorName, occurredAt);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async addSyncFlag(
    jobId: string,
    message: string,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord> {
    const job = await this.jobsDataRepository.addSyncFlag(jobId, message, actorName, occurredAt);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async listRegisterEntriesForJob(
    jobId: string,
    includeVoided = false
  ): Promise<RegisterEntryRecord[]> {
    await this.ensureJobExists(jobId);
    return this.jobsDataRepository.listRegisterEntriesForJob(jobId, includeVoided);
  }

  async getRegisterEntryById(registerEntryId: string): Promise<RegisterEntryRecord> {
    const registerEntry = await this.jobsDataRepository.getRegisterEntryById(registerEntryId);

    if (!registerEntry) {
      throw new NotFoundException('Register entry not found.');
    }

    return registerEntry;
  }

  async createRegisterEntry(
    jobId: string,
    input: CreateRegisterEntryInput,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<RegisterEntryRecord> {
    await this.ensureJobExists(jobId);
    return this.jobsDataRepository.createRegisterEntry(jobId, input, actor, occurredAt);
  }

  async updateRegisterEntry(
    registerEntryId: string,
    input: UpdateRegisterEntryInput,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord> {
    const registerEntry = await this.jobsDataRepository.updateRegisterEntry(
      registerEntryId,
      input,
      actorName,
      occurredAt
    );

    if (!registerEntry) {
      throw new NotFoundException('Register entry not found.');
    }

    return registerEntry;
  }

  async voidRegisterEntry(
    registerEntryId: string,
    reason: string | undefined,
    actorName: string,
    occurredAt?: string
  ): Promise<RegisterEntryRecord> {
    const registerEntry = await this.jobsDataRepository.voidRegisterEntry(
      registerEntryId,
      reason,
      actorName,
      occurredAt
    );

    if (!registerEntry) {
      throw new NotFoundException('Register entry not found.');
    }

    return registerEntry;
  }

  async getAppointmentById(appointmentId: string): Promise<AppointmentRecord> {
    const appointment = await this.jobsDataRepository.getAppointmentById(appointmentId);

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    return appointment;
  }

  async listAssignedJobsForEmployee(
    employeeId: string,
    allowedDates: Set<string>
  ): Promise<JobRecord[]> {
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

  async listMediaAttachmentsForJob(
    jobId: string,
    includeVoided = false
  ): Promise<MediaAttachmentRecord[]> {
    await this.ensureJobExists(jobId);
    return this.jobsDataRepository.listMediaAttachmentsForJob(jobId, includeVoided);
  }

  async getMediaAttachmentById(mediaId: string): Promise<MediaAttachmentRecord> {
    const media = await this.jobsDataRepository.getMediaAttachmentById(mediaId);

    if (!media) {
      throw new NotFoundException('Media attachment not found.');
    }

    return media;
  }

  async findMediaAttachmentByJobAndSha(
    jobId: string,
    sha256: string
  ): Promise<MediaAttachmentRecord | null> {
    return this.jobsDataRepository.findMediaAttachmentByJobAndSha(jobId, sha256);
  }

  async createMediaAttachment(
    jobId: string,
    input: CreateMediaAttachmentInput,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord> {
    await this.ensureJobExists(jobId);
    return this.jobsDataRepository.createMediaAttachment(jobId, input, occurredAt);
  }

  async markMediaAttachmentBlobUploaded(
    mediaId: string,
    storagePath: string,
    uploadedAt: string
  ): Promise<MediaAttachmentRecord> {
    const media = await this.jobsDataRepository.markMediaAttachmentBlobUploaded(
      mediaId,
      storagePath,
      uploadedAt
    );

    if (!media) {
      throw new NotFoundException('Media attachment not found.');
    }

    return media;
  }

  async updateMediaAttachmentCaption(
    mediaId: string,
    input: UpdateMediaAttachmentCaptionInput,
    actorName: string,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord> {
    const media = await this.jobsDataRepository.updateMediaAttachmentCaption(
      mediaId,
      input,
      actorName,
      occurredAt
    );

    if (!media) {
      throw new NotFoundException('Media attachment not found.');
    }

    return media;
  }

  async voidMediaAttachment(
    mediaId: string,
    reason: string | undefined,
    actorName: string,
    occurredAt?: string
  ): Promise<MediaAttachmentRecord> {
    const media = await this.jobsDataRepository.voidMediaAttachment(
      mediaId,
      reason,
      actorName,
      occurredAt
    );

    if (!media) {
      throw new NotFoundException('Media attachment not found.');
    }

    return media;
  }

  private async ensureJobExists(jobId: string): Promise<void> {
    if (!(await this.jobsDataRepository.jobExists(jobId))) {
      throw new NotFoundException('Job not found.');
    }
  }
}
