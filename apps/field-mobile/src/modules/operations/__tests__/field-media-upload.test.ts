import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldMediaUploadError } from '../field-media-errors';

const fileSystemMock = vi.hoisted(() => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  uploadAsync: vi.fn()
}));

vi.mock('expo-file-system', () => fileSystemMock);

// eslint-disable-next-line import/first -- Expo FileSystem must be mocked before loading the upload helper.
import { uploadFieldMediaBlob } from '../field-media-upload';

describe('uploadFieldMediaBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads raw octet-stream bytes from the local file URI', async () => {
    fileSystemMock.uploadAsync.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        mediaAttachment: {
          id: 'media-1',
          jobId: 'job-1',
          kind: 'image',
          contentType: 'image/jpeg',
          byteSize: 5,
          sha256: 'a'.repeat(64),
          originalFilename: 'photo.jpg',
          capturedByEmployeeId: 'employee-1',
          capturedByName: 'Taylor Tech',
          capturedAt: '2026-05-23T12:00:00.000Z',
          uploadCompleted: true,
          isVoid: false,
          createdAt: '2026-05-23T12:00:00.000Z',
          updatedAt: '2026-05-23T12:00:00.000Z'
        }
      })
    });

    const response = await uploadFieldMediaBlob({
      apiBaseUrl: 'http://server.local/',
      mediaId: 'media-1',
      uploadToken: 'token value',
      localUri: 'file:///app/Documents/bellfield-media/media-1.jpg'
    });

    expect(fileSystemMock.uploadAsync).toHaveBeenCalledWith(
      'http://server.local/operations/media/media-1/blob?token=token%20value',
      'file:///app/Documents/bellfield-media/media-1.jpg',
      {
        httpMethod: 'POST',
        uploadType: 0,
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      }
    );
    expect(response.mediaAttachment.id).toBe('media-1');
  });

  it('throws a typed upload error with status and server message', async () => {
    fileSystemMock.uploadAsync.mockResolvedValue({
      status: 413,
      body: JSON.stringify({ message: 'Uploaded media exceeds the configured maximum.' })
    });

    await expect(
      uploadFieldMediaBlob({
        apiBaseUrl: 'http://server.local',
        mediaId: 'media-1',
        uploadToken: 'token',
        localUri: 'file:///media-1.jpg'
      })
    ).rejects.toMatchObject({
      name: 'FieldMediaUploadError',
      status: 413,
      message: 'Uploaded media exceeds the configured maximum.'
    } satisfies Partial<FieldMediaUploadError>);
  });
});
