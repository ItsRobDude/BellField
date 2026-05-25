import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  CreateMediaAttachmentInput,
  MediaAttachmentKind,
  MediaAttachmentRecord,
  UpdateMediaAttachmentCaptionInput
} from './company-data.types';
import {
  buildMediaCaptionMessage,
  buildMediaVoidedMessage,
  insertJobTimelineEntry
} from './jobs-data-repository-utils';

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

@Injectable()
export class JobsMediaDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listMediaAttachmentsForJob(
    jobId: string,
    includeVoided = false
  ): Promise<MediaAttachmentRecord[]> {
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

  async findMediaAttachmentByJobAndSha(
    jobId: string,
    sha256: string
  ): Promise<MediaAttachmentRecord | null> {
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
        where job_id = $1 and sha256 = $2 and is_void = false
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
      await insertJobTimelineEntry(
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

      await queryable.query('update jobs set updated_at = $2 where id = $1', [
        existing.jobId,
        timelineTime
      ]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: existing.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'mediaCaptionEdited',
          message: buildMediaCaptionMessage(existing.originalFilename, trimmedCaption)
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

      await queryable.query('update jobs set updated_at = $2 where id = $1', [
        existing.jobId,
        timelineTime
      ]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId: existing.jobId,
          occurredAt: timelineTime,
          actorName,
          kind: 'mediaVoided',
          message: buildMediaVoidedMessage(existing.originalFilename, trimmedReason)
        },
        queryable
      );
    });

    return this.getMediaAttachmentById(mediaId);
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
}
