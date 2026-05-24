import { describe, expect, it, vi } from 'vitest';
import type { CreateMediaUploadIntentResponse } from '@/lib/operations-api';
import { replayFieldMediaUploadOperation, type MediaUploadOperation } from '../field-media-replay';

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

function buildUploadIntentResponse(overrides: Partial<CreateMediaUploadIntentResponse> = {}): CreateMediaUploadIntentResponse {
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

    await replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob });

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

    await replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob });

    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it('can be retried after a blob failure without mutating the queued operation', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue(buildUploadIntentResponse());
    const uploadBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error('Server unavailable.'))
      .mockResolvedValueOnce(undefined);

    await expect(replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob })).rejects.toThrow(
      'Server unavailable.'
    );
    await replayFieldMediaUploadOperation(baseOperation, { createUploadIntent, uploadBlob });

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
});
