import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  PayloadTooLargeException
} from '@nestjs/common';
import { JobsDataService } from '../company-data/jobs-data.service';
import { mediaAttachmentKinds } from '../company-data/company-data.types';
import type { MediaAttachmentRecord } from '../company-data/company-data.types';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type { AuthorizedEmployee } from '../identity-access/identity-access.types';
import { getAssignedWorkWindow } from '../jobs-appointments/field-work-window';
import { MediaConfigService } from './media-config.service';
import { MediaStorageService } from './media-storage.service';
import { MediaTokenService } from './media-token.service';
import type {
  CreateMediaUploadIntentRequestDto,
  CreateMediaUploadIntentResponseDto,
  MediaAttachmentResponseDto,
  MediaAttachmentSummaryDto,
  MediaAttachmentsResponseDto,
  UpdateMediaAttachmentRequestDto,
  VoidMediaAttachmentRequestDto
} from './media.dto';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/pdf',
  'text/plain'
]);

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const FIELD_MEDIA_SCOPE_MESSAGE = 'Media access is limited to currently assigned field work.';

@Injectable()
export class MediaService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly mediaConfig: MediaConfigService,
    private readonly mediaStorage: MediaStorageService,
    private readonly mediaToken: MediaTokenService
  ) {}

  async listForJob(sessionToken: string, jobId: string): Promise<MediaAttachmentsResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'media:view');
    await this.ensureFieldJobAccess(actor, jobId);
    const records = await this.jobsDataService.listMediaAttachmentsForJob(jobId, true);
    return { mediaAttachments: records.map((record) => this.toSummary(record)) };
  }

  async getById(sessionToken: string, mediaId: string): Promise<MediaAttachmentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'media:view');
    const record = await this.jobsDataService.getMediaAttachmentById(mediaId);
    await this.ensureFieldJobAccess(actor, record.jobId);
    return { mediaAttachment: this.toSummary(record) };
  }

  async createUploadIntent(
    sessionToken: string,
    jobId: string,
    request: CreateMediaUploadIntentRequestDto
  ): Promise<CreateMediaUploadIntentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'media:create');
    this.validateIntent(request);
    await this.ensureFieldJobAccess(actor, jobId);
    await this.ensureAppointmentBelongsToJob(jobId, request.appointmentId);

    const normalizedSha256 = request.sha256.toLowerCase();
    const existing = await this.jobsDataService.findMediaAttachmentByJobAndSha(jobId, normalizedSha256);
    if (existing && !existing.isVoid) {
      // Dedup. If the bytes are already on disk we just hand back the existing
      // metadata. If not, the caller can re-upload to finalize the same row.
      const uploadCompleted = Boolean(existing.uploadedAt && existing.storagePath);
      const summary = this.toSummary(existing);
      if (uploadCompleted) {
        return {
          mediaAttachment: summary,
          uploadCompleted: true,
          maxByteSize: this.mediaConfig.getMaxByteSize()
        };
      }
      const signed = this.mediaToken.signToken(existing.id, 'upload');
      return {
        mediaAttachment: summary,
        uploadCompleted: false,
        uploadToken: signed.token,
        uploadTokenExpiresAt: signed.expiresAt,
        maxByteSize: this.mediaConfig.getMaxByteSize()
      };
    }

    const capturedAt = request.capturedAt ?? new Date().toISOString();
    const created = await this.jobsDataService.createMediaAttachment(jobId, {
      appointmentId: request.appointmentId,
      kind: request.kind,
      contentType: request.contentType,
      byteSize: request.byteSize,
      sha256: normalizedSha256,
      originalFilename: request.originalFilename,
      caption: request.caption,
      capturedAt,
      capturedByEmployeeId: actor.id,
      capturedByName: actor.displayName
    });

    const signed = this.mediaToken.signToken(created.id, 'upload');
    return {
      mediaAttachment: this.toSummary(created),
      uploadCompleted: false,
      uploadToken: signed.token,
      uploadTokenExpiresAt: signed.expiresAt,
      maxByteSize: this.mediaConfig.getMaxByteSize()
    };
  }

  /**
   * Verifies the upload token, byte size, and sha256 against the metadata row,
   * writes the bytes to the filesystem under the configured media root, and
   * marks the row as uploaded. Idempotent on a repeated successful upload for
   * the same media id.
   */
  async finalizeBlobUpload(
    mediaId: string,
    uploadToken: string,
    bytes: Buffer
  ): Promise<MediaAttachmentResponseDto> {
    const verified = this.mediaToken.verifyToken(uploadToken, mediaId, 'upload');
    if (!verified) {
      throw new ForbiddenException('Media upload token is invalid or expired.');
    }

    const record = await this.jobsDataService.getMediaAttachmentById(mediaId);
    if (record.isVoid) {
      throw new ConflictException('Voided media cannot be uploaded.');
    }

    if (bytes.length > this.mediaConfig.getMaxByteSize()) {
      throw new PayloadTooLargeException(
        `Uploaded media exceeds the configured maximum of ${this.mediaConfig.getMaxByteSize()} bytes.`
      );
    }
    if (bytes.length !== record.byteSize) {
      throw new BadRequestException('Uploaded byte size does not match the media intent.');
    }

    const actualSha256 = this.mediaStorage.hashBytes(bytes);
    if (actualSha256 !== record.sha256) {
      throw new BadRequestException('Uploaded media sha256 does not match the media intent.');
    }

    const storagePath = await this.mediaStorage.writeBlob(record.jobId, record.id, record.contentType, bytes);
    const uploadedAt = new Date().toISOString();
    const finalized = await this.jobsDataService.markMediaAttachmentBlobUploaded(record.id, storagePath, uploadedAt);

    return { mediaAttachment: this.toSummary(finalized) };
  }

  async updateMedia(
    sessionToken: string,
    mediaId: string,
    request: UpdateMediaAttachmentRequestDto
  ): Promise<MediaAttachmentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'media:edit');
    if (request.caption === undefined) {
      throw new BadRequestException('No editable fields supplied.');
    }
    if (request.caption !== null && request.caption.length > 500) {
      throw new BadRequestException('Caption must be at most 500 characters.');
    }
    const currentRecord = await this.jobsDataService.getMediaAttachmentById(mediaId);
    await this.ensureFieldJobAccess(actor, currentRecord.jobId);
    const record = await this.jobsDataService.updateMediaAttachmentCaption(
      mediaId,
      { caption: request.caption },
      actor.displayName
    );
    return { mediaAttachment: this.toSummary(record) };
  }

  async voidMedia(
    sessionToken: string,
    mediaId: string,
    request: VoidMediaAttachmentRequestDto
  ): Promise<MediaAttachmentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'media:edit');
    if (request.reason !== undefined && request.reason.length > 500) {
      throw new BadRequestException('Void reason must be at most 500 characters.');
    }
    const currentRecord = await this.jobsDataService.getMediaAttachmentById(mediaId);
    await this.ensureFieldJobAccess(actor, currentRecord.jobId);
    const record = await this.jobsDataService.voidMediaAttachment(mediaId, request.reason, actor.displayName);
    return { mediaAttachment: this.toSummary(record) };
  }

  /**
   * Resolves a media row + the absolute filesystem path for the blob, after
   * verifying the caller either has a valid signed download token or is an
   * authenticated session with media:view permission. Throws when neither
   * route grants access.
   */
  async authorizeBlobDownload(
    mediaId: string,
    options: { sessionToken?: string; downloadToken?: string }
  ): Promise<{ record: MediaAttachmentRecord; absolutePath: string }> {
    let authorizedByToken = false;
    let actor: AuthorizedEmployee | undefined;

    if (options.downloadToken) {
      const verified = this.mediaToken.verifyToken(options.downloadToken, mediaId, 'download');
      if (verified) {
        authorizedByToken = true;
      }
    }

    if (!authorizedByToken && options.sessionToken) {
      try {
        actor = await this.identityAccessService.getAuthorizedEmployee(options.sessionToken, 'media:view');
      } catch {
        // fall through; we throw below if no path granted access
      }
    }

    if (!authorizedByToken && !actor) {
      throw new ForbiddenException('Media download requires a valid session or signed download token.');
    }

    const record = await this.jobsDataService.getMediaAttachmentById(mediaId);
    if (actor) {
      await this.ensureFieldJobAccess(actor, record.jobId);
    }
    if (!record.storagePath || !record.uploadedAt) {
      throw new ConflictException('Media bytes have not been uploaded yet.');
    }
    const absolutePath = this.mediaStorage.toAbsolutePath(record.storagePath);
    return { record, absolutePath };
  }

  signDownloadToken(mediaId: string): { token: string; expiresAt: string } {
    return this.mediaToken.signToken(mediaId, 'download');
  }

  async openBlobReadStream(
    mediaId: string,
    options: { sessionToken?: string; downloadToken?: string }
  ) {
    const { record } = await this.authorizeBlobDownload(mediaId, options);
    if (!record.storagePath) {
      throw new ConflictException('Media bytes have not been uploaded yet.');
    }
    return this.mediaStorage.createBlobReadStream(record.storagePath);
  }

  getMaxByteSize(): number {
    return this.mediaConfig.getMaxByteSize();
  }

  private validateIntent(request: CreateMediaUploadIntentRequestDto): void {
    if (!request) {
      throw new BadRequestException('Media upload intent payload is required.');
    }
    if (!mediaAttachmentKinds.includes(request.kind)) {
      throw new BadRequestException('Invalid media kind.');
    }
    if (!request.contentType || !ALLOWED_CONTENT_TYPES.has(request.contentType.toLowerCase())) {
      throw new BadRequestException('Unsupported content type for BellField media.');
    }
    if (!Number.isInteger(request.byteSize) || request.byteSize <= 0) {
      throw new BadRequestException('byteSize must be a positive integer.');
    }
    if (request.byteSize > this.mediaConfig.getMaxByteSize()) {
      throw new PayloadTooLargeException(
        `Media exceeds the configured maximum of ${this.mediaConfig.getMaxByteSize()} bytes.`
      );
    }
    if (typeof request.sha256 !== 'string' || !SHA256_HEX_PATTERN.test(request.sha256.toLowerCase())) {
      throw new BadRequestException('sha256 must be a 64-character hex string.');
    }
    if (
      typeof request.originalFilename !== 'string' ||
      request.originalFilename.trim().length === 0 ||
      request.originalFilename.length > 255
    ) {
      throw new BadRequestException('originalFilename must be between 1 and 255 characters.');
    }
    if (request.caption !== undefined && request.caption !== null && request.caption.length > 500) {
      throw new BadRequestException('caption must be at most 500 characters.');
    }
  }

  private async ensureAppointmentBelongsToJob(jobId: string, appointmentId: string | undefined): Promise<void> {
    if (!appointmentId) {
      return;
    }
    const appointment = await this.jobsDataService.getAppointmentById(appointmentId);
    if (appointment.jobId !== jobId) {
      throw new ConflictException('Appointment does not belong to the given job.');
    }
  }

  private async ensureFieldJobAccess(actor: AuthorizedEmployee, jobId: string): Promise<void> {
    if (actor.sessionSurface !== 'field-mobile') {
      return;
    }

    const { allowedDates } = getAssignedWorkWindow();
    const assignedJobs = await this.jobsDataService.listAssignedJobsForEmployee(actor.id, allowedDates);
    if (!assignedJobs.some((job) => job.id === jobId)) {
      throw new ForbiddenException(FIELD_MEDIA_SCOPE_MESSAGE);
    }
  }

  private toSummary(record: MediaAttachmentRecord): MediaAttachmentSummaryDto {
    return {
      id: record.id,
      jobId: record.jobId,
      appointmentId: record.appointmentId,
      kind: record.kind,
      contentType: record.contentType,
      byteSize: record.byteSize,
      sha256: record.sha256,
      originalFilename: record.originalFilename,
      caption: record.caption,
      capturedByEmployeeId: record.capturedByEmployeeId,
      capturedByName: record.capturedByName,
      capturedAt: record.capturedAt,
      uploadCompleted: Boolean(record.uploadedAt && record.storagePath),
      uploadedAt: record.uploadedAt,
      isVoid: record.isVoid,
      voidReason: record.voidReason,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}
