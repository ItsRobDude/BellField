import { BadRequestException, ConflictException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { MediaConfigService } from './media-config.service';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { MediaTokenService } from './media-token.service';
import type { MediaAttachmentRecord } from '../company-data/company-data.types';

function makeTempRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'bellfield-media-spec-'));
}

function createMediaService(options: { mediaRoot?: string } = {}) {
  const mediaRoot = options.mediaRoot ?? makeTempRoot();
  // Pin the root + secret to known values; leave BELLFIELD_MEDIA_MAX_BYTES
  // and BELLFIELD_MEDIA_TOKEN_TTL_SECONDS untouched so individual tests can
  // override them before calling this helper.
  process.env.NODE_ENV = 'test';
  process.env.BELLFIELD_MEDIA_ROOT = mediaRoot;
  process.env.BELLFIELD_MEDIA_TOKEN_SECRET = 'spec-secret';

  const mediaConfig = new MediaConfigService();
  mediaConfig.onModuleInit();

  const mediaStorage = new MediaStorageService(mediaConfig);
  const mediaToken = new MediaTokenService(mediaConfig);

  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'employee-1',
      displayName: 'Field Tech',
      effectivePermissions: ['media:view', 'media:create', 'media:edit'],
      sessionSurface: 'field-mobile'
    })
  };
  const jobsDataService = {
    findMediaAttachmentByJobAndSha: jest.fn().mockResolvedValue(null),
    createMediaAttachment: jest.fn(),
    getMediaAttachmentById: jest.fn(),
    listMediaAttachmentsForJob: jest.fn().mockResolvedValue([]),
    markMediaAttachmentBlobUploaded: jest.fn(),
    updateMediaAttachmentCaption: jest.fn(),
    voidMediaAttachment: jest.fn(),
    getAppointmentById: jest.fn()
  };

  const service = new MediaService(
    identityAccessService as never,
    jobsDataService as never,
    mediaConfig,
    mediaStorage,
    mediaToken
  );

  return { service, mediaConfig, mediaStorage, mediaToken, identityAccessService, jobsDataService, mediaRoot };
}

function buildMediaRecord(overrides: Partial<MediaAttachmentRecord> = {}): MediaAttachmentRecord {
  return {
    id: 'media-1',
    jobId: 'job-1',
    appointmentId: undefined,
    kind: 'image',
    contentType: 'image/jpeg',
    byteSize: 5,
    sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    originalFilename: 'compressor.jpg',
    caption: undefined,
    capturedByEmployeeId: 'employee-1',
    capturedByName: 'Field Tech',
    capturedAt: '2026-04-14T11:00:00.000Z',
    storagePath: undefined,
    uploadedAt: undefined,
    isVoid: false,
    voidReason: undefined,
    createdAt: '2026-04-14T11:00:00.000Z',
    updatedAt: '2026-04-14T11:00:00.000Z',
    ...overrides
  };
}

const validSha256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'; // sha256 of 'hello'

afterEach(() => {
  // Best-effort cleanup of any temp dirs we created. If a test failed mid-run
  // we don't want to leave litter behind.
});

describe('MediaService.createUploadIntent', () => {
  it('requires media:create on the actor', async () => {
    const root = makeTempRoot();
    try {
      const { service, identityAccessService } = createMediaService({ mediaRoot: root });
      identityAccessService.getAuthorizedEmployee.mockRejectedValueOnce(
        new ForbiddenException('You do not have permission to perform this action.')
      );

      await expect(
        service.createUploadIntent('session-token', 'job-1', {
          kind: 'image',
          contentType: 'image/jpeg',
          byteSize: 5,
          sha256: validSha256,
          originalFilename: 'photo.jpg'
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'media:create');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unsupported content types', async () => {
    const root = makeTempRoot();
    try {
      const { service } = createMediaService({ mediaRoot: root });
      await expect(
        service.createUploadIntent('session-token', 'job-1', {
          kind: 'image',
          contentType: 'application/x-zip-compressed',
          byteSize: 5,
          sha256: validSha256,
          originalFilename: 'photo.zip'
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects non-positive byte sizes and sizes over the configured max', async () => {
    const root = makeTempRoot();
    process.env.BELLFIELD_MEDIA_MAX_BYTES = '10';
    try {
      const { service } = createMediaService({ mediaRoot: root });
      await expect(
        service.createUploadIntent('session-token', 'job-1', {
          kind: 'image',
          contentType: 'image/jpeg',
          byteSize: 0,
          sha256: validSha256,
          originalFilename: 'photo.jpg'
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createUploadIntent('session-token', 'job-1', {
          kind: 'image',
          contentType: 'image/jpeg',
          byteSize: 100,
          sha256: validSha256,
          originalFilename: 'photo.jpg'
        })
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    } finally {
      delete process.env.BELLFIELD_MEDIA_MAX_BYTES;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed sha256 values', async () => {
    const root = makeTempRoot();
    try {
      const { service } = createMediaService({ mediaRoot: root });
      await expect(
        service.createUploadIntent('session-token', 'job-1', {
          kind: 'image',
          contentType: 'image/jpeg',
          byteSize: 5,
          sha256: 'not-a-real-hash',
          originalFilename: 'photo.jpg'
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects intents whose appointment belongs to a different job', async () => {
    const root = makeTempRoot();
    try {
      const { service, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.getAppointmentById.mockResolvedValueOnce({
        id: 'appointment-1',
        jobId: 'other-job',
        status: 'scheduled',
        createdAt: '2026-04-14T10:00:00.000Z',
        updatedAt: '2026-04-14T10:00:00.000Z'
      });

      await expect(
        service.createUploadIntent('session-token', 'job-1', {
          appointmentId: 'appointment-1',
          kind: 'image',
          contentType: 'image/jpeg',
          byteSize: 5,
          sha256: validSha256,
          originalFilename: 'photo.jpg'
        })
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates a new media row and mints an upload token when the (jobId, sha256) is new', async () => {
    const root = makeTempRoot();
    try {
      const { service, jobsDataService } = createMediaService({ mediaRoot: root });
      const created = buildMediaRecord();
      jobsDataService.createMediaAttachment.mockResolvedValueOnce(created);

      const response = await service.createUploadIntent('session-token', 'job-1', {
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 5,
        sha256: validSha256,
        originalFilename: 'compressor.jpg'
      });

      expect(response.uploadCompleted).toBe(false);
      expect(response.uploadToken).toBeTruthy();
      expect(response.uploadTokenExpiresAt).toBeTruthy();
      expect(response.maxByteSize).toBeGreaterThan(0);
      expect(response.mediaAttachment.id).toBe('media-1');
      expect(jobsDataService.createMediaAttachment).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dedupes by (jobId, sha256) and returns uploadCompleted when bytes are already on disk', async () => {
    const root = makeTempRoot();
    try {
      const { service, jobsDataService } = createMediaService({ mediaRoot: root });
      const existing = buildMediaRecord({
        storagePath: 'job-1/media-1.jpg',
        uploadedAt: '2026-04-14T11:05:00.000Z'
      });
      jobsDataService.findMediaAttachmentByJobAndSha.mockResolvedValueOnce(existing);

      const response = await service.createUploadIntent('session-token', 'job-1', {
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 5,
        sha256: validSha256,
        originalFilename: 'photo.jpg'
      });

      expect(response.uploadCompleted).toBe(true);
      expect(response.uploadToken).toBeUndefined();
      expect(response.mediaAttachment.id).toBe('media-1');
      expect(jobsDataService.createMediaAttachment).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dedupes by (jobId, sha256) and returns a fresh upload token when bytes have not landed yet', async () => {
    const root = makeTempRoot();
    try {
      const { service, jobsDataService } = createMediaService({ mediaRoot: root });
      const existing = buildMediaRecord(); // storagePath/uploadedAt left undefined
      jobsDataService.findMediaAttachmentByJobAndSha.mockResolvedValueOnce(existing);

      const response = await service.createUploadIntent('session-token', 'job-1', {
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 5,
        sha256: validSha256,
        originalFilename: 'photo.jpg'
      });

      expect(response.uploadCompleted).toBe(false);
      expect(response.uploadToken).toBeTruthy();
      expect(jobsDataService.createMediaAttachment).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('defaults capturedAt to the server time when the intent omits it', async () => {
    const root = makeTempRoot();
    try {
      const { service, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.createMediaAttachment.mockResolvedValueOnce(buildMediaRecord());

      await service.createUploadIntent('session-token', 'job-1', {
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 5,
        sha256: validSha256,
        originalFilename: 'photo.jpg'
      });

      const createCall = jobsDataService.createMediaAttachment.mock.calls[0];
      const input = createCall?.[1] as { capturedAt?: string };
      expect(input?.capturedAt).toBeTruthy();
      expect(new Date(input?.capturedAt ?? '').toString()).not.toBe('Invalid Date');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('MediaService.finalizeBlobUpload', () => {
  it('rejects a tampered upload token', async () => {
    const root = makeTempRoot();
    try {
      const { service } = createMediaService({ mediaRoot: root });
      await expect(
        service.finalizeBlobUpload('media-1', 'tampered.payload', Buffer.from('hello'))
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an expired upload token', async () => {
    const root = makeTempRoot();
    process.env.BELLFIELD_MEDIA_TOKEN_TTL_SECONDS = '1';
    try {
      const { service, mediaToken } = createMediaService({ mediaRoot: root });
      const expired = mediaToken.signToken('media-1', 'upload', new Date(Date.now() - 5_000));
      await expect(
        service.finalizeBlobUpload('media-1', expired.token, Buffer.from('hello'))
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      delete process.env.BELLFIELD_MEDIA_TOKEN_TTL_SECONDS;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an upload whose byte size does not match the intent', async () => {
    const root = makeTempRoot();
    try {
      const { service, mediaToken, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.getMediaAttachmentById.mockResolvedValueOnce(buildMediaRecord({ byteSize: 99 }));
      const token = mediaToken.signToken('media-1', 'upload').token;

      await expect(
        service.finalizeBlobUpload('media-1', token, Buffer.from('hello'))
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an upload whose sha256 does not match the intent', async () => {
    const root = makeTempRoot();
    try {
      const { service, mediaToken, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.getMediaAttachmentById.mockResolvedValueOnce(
        buildMediaRecord({ byteSize: 5, sha256: 'a'.repeat(64) })
      );
      const token = mediaToken.signToken('media-1', 'upload').token;

      await expect(
        service.finalizeBlobUpload('media-1', token, Buffer.from('hello'))
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an upload that exceeds the configured maximum byte size', async () => {
    const root = makeTempRoot();
    process.env.BELLFIELD_MEDIA_MAX_BYTES = '4';
    try {
      const { service, mediaToken, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.getMediaAttachmentById.mockResolvedValueOnce(buildMediaRecord({ byteSize: 5 }));
      const token = mediaToken.signToken('media-1', 'upload').token;

      await expect(
        service.finalizeBlobUpload('media-1', token, Buffer.from('hello'))
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    } finally {
      delete process.env.BELLFIELD_MEDIA_MAX_BYTES;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes the blob under the media root and marks the row uploaded on a valid finalize', async () => {
    const root = makeTempRoot();
    try {
      const { service, mediaToken, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.getMediaAttachmentById.mockResolvedValueOnce(buildMediaRecord({ byteSize: 5 }));
      const uploaded = buildMediaRecord({
        byteSize: 5,
        storagePath: 'job-1/media-1.jpg',
        uploadedAt: '2026-04-14T11:05:00.000Z'
      });
      jobsDataService.markMediaAttachmentBlobUploaded.mockResolvedValueOnce(uploaded);
      const token = mediaToken.signToken('media-1', 'upload').token;

      const response = await service.finalizeBlobUpload('media-1', token, Buffer.from('hello'));

      expect(response.mediaAttachment.uploadCompleted).toBe(true);
      const markCall = jobsDataService.markMediaAttachmentBlobUploaded.mock.calls[0];
      expect(markCall?.[0]).toBe('media-1');
      // Storage path must stay relative to the media root.
      const writtenStoragePath = markCall?.[1] as string;
      expect(writtenStoragePath.startsWith(path.sep)).toBe(false);
      expect(writtenStoragePath.startsWith('job-1')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('MediaService authorize/edit/void/list', () => {
  it('listForJob requires media:view', async () => {
    const root = makeTempRoot();
    try {
      const { service, identityAccessService } = createMediaService({ mediaRoot: root });
      await service.listForJob('session-token', 'job-1');
      expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'media:view');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('updateMedia rejects when no editable fields are supplied', async () => {
    const root = makeTempRoot();
    try {
      const { service } = createMediaService({ mediaRoot: root });
      await expect(service.updateMedia('session-token', 'media-1', {} as never)).rejects.toBeInstanceOf(
        BadRequestException
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('updateMedia routes the caption through media:edit permission', async () => {
    const root = makeTempRoot();
    try {
      const { service, identityAccessService, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.updateMediaAttachmentCaption.mockResolvedValueOnce(
        buildMediaRecord({ caption: 'New caption' })
      );
      await service.updateMedia('session-token', 'media-1', { caption: 'New caption' });
      expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'media:edit');
      expect(jobsDataService.updateMediaAttachmentCaption).toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('voidMedia routes through media:edit and forwards the reason', async () => {
    const root = makeTempRoot();
    try {
      const { service, identityAccessService, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.voidMediaAttachment.mockResolvedValueOnce(buildMediaRecord({ isVoid: true, voidReason: 'wrong photo' }));

      await service.voidMedia('session-token', 'media-1', { reason: 'wrong photo' });
      expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'media:edit');
      const voidCall = jobsDataService.voidMediaAttachment.mock.calls[0];
      expect(voidCall?.[0]).toBe('media-1');
      expect(voidCall?.[1]).toBe('wrong photo');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('authorizeBlobDownload accepts a valid signed download token even when no session is supplied', async () => {
    const root = makeTempRoot();
    try {
      const { service, mediaToken, jobsDataService, identityAccessService } = createMediaService({ mediaRoot: root });
      const record = buildMediaRecord({
        storagePath: 'job-1/media-1.jpg',
        uploadedAt: '2026-04-14T11:05:00.000Z'
      });
      jobsDataService.getMediaAttachmentById.mockResolvedValueOnce(record);
      const downloadToken = mediaToken.signToken('media-1', 'download').token;

      const { record: returned } = await service.authorizeBlobDownload('media-1', { downloadToken });
      expect(returned.id).toBe('media-1');
      expect(identityAccessService.getAuthorizedEmployee).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('authorizeBlobDownload rejects when neither a valid token nor a valid session is supplied', async () => {
    const root = makeTempRoot();
    try {
      const { service, identityAccessService } = createMediaService({ mediaRoot: root });
      identityAccessService.getAuthorizedEmployee.mockRejectedValueOnce(new ForbiddenException('nope'));
      await expect(service.authorizeBlobDownload('media-1', { sessionToken: 'bad' })).rejects.toBeInstanceOf(
        ForbiddenException
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('authorizeBlobDownload rejects when the media row has no bytes on disk yet', async () => {
    const root = makeTempRoot();
    try {
      const { service, mediaToken, jobsDataService } = createMediaService({ mediaRoot: root });
      jobsDataService.getMediaAttachmentById.mockResolvedValueOnce(buildMediaRecord());
      const downloadToken = mediaToken.signToken('media-1', 'download').token;

      await expect(
        service.authorizeBlobDownload('media-1', { downloadToken })
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('MediaService path safety', () => {
  it('refuses to resolve a blob path whose components would escape the configured media root', async () => {
    const root = makeTempRoot();
    try {
      const { mediaStorage } = createMediaService({ mediaRoot: root });
      expect(() => mediaStorage.resolveBlobPath('..', 'media-1', 'image/jpeg')).toThrow();
      expect(() => mediaStorage.resolveBlobPath('job-1', '../escape', 'image/jpeg')).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to read an existing storage_path that points outside the configured root', async () => {
    const root = makeTempRoot();
    try {
      const { mediaStorage } = createMediaService({ mediaRoot: root });
      expect(() => mediaStorage.toAbsolutePath('../etc/passwd')).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
