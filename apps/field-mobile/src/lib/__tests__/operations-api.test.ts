import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFieldMediaUploadIntent, FieldApiError, isFieldApiError } from '../operations-api';

describe('operations API error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves HTTP status and readable server message on failed requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        json: async () => ({ message: 'Media exceeds the configured maximum of 50000000 bytes.' })
      })
    );

    let capturedError: unknown;

    try {
      await createFieldMediaUploadIntent({
        apiBaseUrl: 'http://server.local',
        sessionToken: 'session-token',
        jobId: 'job-1',
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 50_000_001,
        sha256: 'a'.repeat(64),
        originalFilename: 'photo.jpg'
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(FieldApiError);
    expect(isFieldApiError(capturedError)).toBe(true);
    expect(capturedError).toMatchObject({
      status: 413,
      message: 'Media exceeds the configured maximum of 50000000 bytes.'
    });
  });
});
