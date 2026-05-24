import { describe, expect, it, vi } from 'vitest';
import { FieldApiError, type CreateMediaUploadIntentResponse } from '@/lib/operations-api';
import { replayFieldMediaUploadOperation, type MediaUploadOperation } from '../field-media-replay';
import { FieldMediaUploadError } from '../field-media-errors';

const baseOperation: MediaUploadOperation = {
  id: 'media-1-upload',
  kind: 'mediaUpload',
  jobId: 'job-1',
  localMediaId: 'media-1',
  localUri: 'file:///app/Documents/bellfield-media/media-1.jpg',
  originalFilename: 'media-1.jpg',
  mediaKind: 'image',
  contentType: 'image/jpeg',
  byteSize: 5,
  sha256: 'a'.repeat(64),
  capturedAt: '2026-05-23T12:00:00.000Z',
  occurredAt: '2026-05-23T12:00:00.000Z',
  state: 'pending'
};

function buildUploadIntentResponse(
  overrides: Partial<CreateMediaUploadIntentResponse> = {}
): CreateMediaUploadIntentResponse {
  return {
    mediaAttachment: {
      id: 'media-server-1',
      jobId: 'job-1',
      kind: 'image',
      contentType: 'image/jpeg',
      byteSize: 5,
      sha256: 'a'.repeat(64),
      originalFilename: 'media-1.jpg',
      capturedByEmployeeId: 'employee-1',
      capturedByName: 'Taylor Tech',
      capturedAt: baseOperation.capturedAt,
      uploadCompleted: false,
      isVoid: false,
      createdAt: baseOperation.capturedAt,
      updatedAt: baseOperation.capturedAt
    },
    uploadCompleted: false,
    uploadToken: 'upload-token',
    uploadTokenExpiresAt: '2026-05-23T12:05:00.000Z',
    maxByteSize: 50_000_000,
    ...overrides
  };
}

describe('replayFieldMediaUploadOperation', () => {
  it('creates the upload intent and uploads raw blob bytes when bytes are not already complete', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(buildUploadIntentResponse());
    const uploadBlob = vi.fn().mockResolvedValue(undefined);

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })
    ).resolves.toEqual({
      status: 'applied'
    });

    expect(createUploadIntent).toHaveBeenCalledWith(baseOperation);
    expect(uploadBlob).toHaveBeenCalledWith({
      mediaId: 'media-server-1',
      uploadToken: 'upload-token',
      localUri: baseOperation.localUri
    });
  });

  it('does not upload bytes when the intent reports an already-complete dedupe hit', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(
      buildUploadIntentResponse({
        uploadCompleted: true,
        uploadToken: undefined,
        uploadTokenExpiresAt: undefined
      })
    );
    const uploadBlob = vi.fn();

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })
    ).resolves.toEqual({
      status: 'applied'
    });

    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it('can be retried after a blob failure without mutating the queued operation', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(buildUploadIntentResponse());
    const uploadBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error('Server unavailable.'))
      .mockResolvedValueOnce(undefined);

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })
    ).rejects.toThrow('Server unavailable.');
    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })
    ).resolves.toEqual({
      status: 'applied'
    });

    expect(baseOperation.state).toBe('pending');
    expect(createUploadIntent).toHaveBeenCalledTimes(2);
    expect(uploadBlob).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the server omits a needed upload token', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(
      buildUploadIntentResponse({
        uploadToken: undefined,
        uploadTokenExpiresAt: undefined
      })
    );

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob: vi.fn() })
    ).rejects.toThrow('upload token');
  });

  it('returns rejected for deterministic upload-intent validation failures', async () => {
    const createUploadIntent = vi
      .fn()
      .mockRejectedValue(
        new FieldApiError('Media exceeds the configured maximum of 50000000 bytes.', 413)
      );

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob: vi.fn() })
    ).resolves.toEqual({
      status: 'rejected',
      message: 'Media exceeds the configured maximum of 50000000 bytes.'
    });
  });

  it('keeps network/server upload-intent failures retryable', async () => {
    const createUploadIntent = vi
      .fn()
      .mockRejectedValue(new FieldApiError('Server unavailable.', 500));

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob: vi.fn() })
    ).rejects.toThrow('Server unavailable.');
  });

  it('returns rejected for deterministic blob upload failures', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(buildUploadIntentResponse());
    const uploadBlob = vi
      .fn()
      .mockRejectedValue(new FieldMediaUploadError('Uploaded byte size does not match.', 400));

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })
    ).resolves.toEqual({
      status: 'rejected',
      message: 'Uploaded byte size does not match.'
    });
  });

  it('keeps expired-token blob failures retryable so the next replay can request a fresh token', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(buildUploadIntentResponse());
    const uploadBlob = vi
      .fn()
      .mockRejectedValue(
        new FieldMediaUploadError('Media upload token is invalid or expired.', 403)
      );

    await expect(
      replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })
    ).rejects.toThrow('Media upload token is invalid or expired.');
  });
});
