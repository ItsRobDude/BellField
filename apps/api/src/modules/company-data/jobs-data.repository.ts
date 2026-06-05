import { Injectable } from '@nestjs/common';
import type { ResolveRegisterCostRequest } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import type {
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
  JobsQueueCursor,
  JobsQueueKey,
  JobsQueuePageRecord,
  MediaAttachmentRecord,
  RegisterEntryRecord,
  UpdateMediaAttachmentCaptionInput,
  UpdateAppointmentScheduleInput,
  UpdateRegisterEntryInput
} from './company-data.types';
import type { FinishReviewInput } from './jobs-data-row-mappers';
import { JobsCommandDataRepository } from './jobs-command-data.repository';
import { JobsMediaDataRepository } from './jobs-media-data.repository';
import { JobsReadDataRepository } from './jobs-read-data.repository';
import { JobsRegisterDataRepository } from './jobs-register-data.repository';

/**
 * Public jobs data surface. This is a thin facade: the read models live in
 * JobsReadDataRepository, the transactional writes in JobsCommandDataRepository, and the
 * register/media surfaces in their own repositories. Keeping one facade preserves the
 * single injection point JobsDataService depends on while the implementation stays split
 * by behavior group (see docs/maintainability-refactor-plan.md, Slice 3).
 */
@Injectable()
export class JobsDataRepository {
  constructor(
    private readonly readRepository: JobsReadDataRepository,
    private readonly commandRepository: JobsCommandDataRepository,
    private readonly registerRepository: JobsRegisterDataRepository,
    private readonly mediaRepository: JobsMediaDataRepository
  ) {}

  async listJobs(): Promise<JobRecord[]> {
    return this.readRepository.listJobs();
  }

  async listDispatchAppointments(
    startDate: string,
    endDate: string
  ): Promise<DispatchAppointmentRecord[]> {
    return this.readRepository.listDispatchAppointments(startDate, endDate);
  }

  async listJobsQueuePage(
    queueKey: JobsQueueKey,
    limit: number,
    cursor?: JobsQueueCursor
  ): Promise<JobsQueuePageRecord> {
    return this.readRepository.listJobsQueuePage(queueKey, limit, cursor);
  }

  async jobExists(jobId: string): Promise<boolean> {
    return this.readRepository.jobExists(jobId);
  }

  async listJobsByIds(jobIds: string[]): Promise<JobRecord[]> {
    return this.readRepository.listJobsByIds(jobIds);
  }

  async getJobById(jobId: string): Promise<JobRecord | null> {
    return this.readRepository.getJobById(jobId);
  }

  async getJobDetailById(jobId: string, timelineLimit: number): Promise<JobDetailRecord | null> {
    return this.readRepository.getJobDetailById(jobId, timelineLimit);
  }

  async listAppointmentsForJob(jobId: string): Promise<AppointmentRecord[]> {
    return this.readRepository.listAppointmentsForJob(jobId);
  }

  async getAppointmentById(appointmentId: string): Promise<AppointmentRecord | null> {
    return this.readRepository.getAppointmentById(appointmentId);
  }

  async listAssignedJobsForEmployee(
    employeeId: string,
    allowedDates: Set<string>
  ): Promise<JobRecord[]> {
    return this.readRepository.listAssignedJobsForEmployee(employeeId, allowedDates);
  }

  async hasFutureAppointments(jobId: string, referenceDate: string): Promise<boolean> {
    return this.readRepository.hasFutureAppointments(jobId, referenceDate);
  }

  async hasCancellableAppointments(jobId: string): Promise<boolean> {
    return this.readRepository.hasCancellableAppointments(jobId);
  }

  async countCancellableAppointments(jobId: string): Promise<number> {
    return this.readRepository.countCancellableAppointments(jobId);
  }

  async hasIncompleteAppointments(jobId: string): Promise<boolean> {
    return this.readRepository.hasIncompleteAppointments(jobId);
  }

  async createJob(
    input: CreateJobInput,
    actorName: string,
    resolvedBillToCustomerId: string,
    locationName: string
  ): Promise<JobRecord> {
    return this.commandRepository.createJob(
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
  ): Promise<JobRecord | null> {
    return this.commandRepository.updateJobStatus(
      jobId,
      status,
      actorName,
      occurredAt,
      expectedCurrentStatus
    );
  }

  async createAppointment(
    jobId: string,
    input: CreateAppointmentInput,
    actorName: string,
    occurredAt?: string,
    queryable?: QueryExecutor
  ): Promise<AppointmentRecord> {
    return this.commandRepository.createAppointment(jobId, input, actorName, occurredAt, queryable);
  }

  async updateAppointmentSchedule(
    appointmentId: string,
    input: UpdateAppointmentScheduleInput,
    actorName: string,
    occurredAt?: string
  ): Promise<AppointmentRecord | null> {
    return this.commandRepository.updateAppointmentSchedule(
      appointmentId,
      input,
      actorName,
      occurredAt
    );
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string,
    finishReview?: FinishReviewInput
  ): Promise<AppointmentRecord | null> {
    return this.commandRepository.updateAppointmentStatus(
      appointmentId,
      status,
      actorName,
      occurredAt,
      finishReview
    );
  }

  async acknowledgeFinishedVisitReview(
    jobId: string,
    decision: FinishedVisitReviewDecision,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord | null> {
    return this.commandRepository.acknowledgeFinishedVisitReview(
      jobId,
      decision,
      actorName,
      occurredAt
    );
  }

  async addJobNote(
    jobId: string,
    noteBody: string,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord | null> {
    return this.commandRepository.addJobNote(jobId, noteBody, actorName, occurredAt);
  }

  async addSyncFlag(
    jobId: string,
    message: string,
    actorName: string,
    occurredAt?: string
  ): Promise<JobRecord | null> {
    return this.commandRepository.addSyncFlag(jobId, message, actorName, occurredAt);
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
    occurredAt?: string,
    allowFinalizedReplay = false
  ): Promise<RegisterEntryRecord> {
    return this.registerRepository.createRegisterEntry(
      jobId,
      input,
      actor,
      occurredAt,
      allowFinalizedReplay
    );
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
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<RegisterEntryRecord | null> {
    return this.registerRepository.voidRegisterEntry(registerEntryId, reason, actor, occurredAt);
  }

  async resolveRegisterEntryCost(
    registerEntryId: string,
    resolution: ResolveRegisterCostRequest,
    actor: { id: string; displayName: string },
    occurredAt?: string
  ): Promise<{ jobId: string }> {
    return this.registerRepository.resolveRegisterEntryCost(
      registerEntryId,
      resolution,
      actor,
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
}
