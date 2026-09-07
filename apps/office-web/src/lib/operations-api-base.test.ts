import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfficeUnauthorizedListener } from './office-session-events';
import { requestBlob, requestJson } from './operations-api-base';

const fetchMock = vi.fn();
const unauthorizedListener = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  unauthorizedListener.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setOfficeUnauthorizedListener(unauthorizedListener);
});

afterEach(() => {
  setOfficeUnauthorizedListener(null);
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob(['bytes'])
  };
}

describe('office API base wrappers', () => {
  it('reports a 401 as the session ending and still throws the server message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { message: 'Session expired. Please sign in again.' })
    );

    await expect(
      requestJson('/operations/jobs/queue', { apiBaseUrl: 'http://api.test', sessionToken: 't' })
    ).rejects.toThrow('Session expired. Please sign in again.');

    expect(unauthorizedListener).toHaveBeenCalledTimes(1);
    expect(unauthorizedListener).toHaveBeenCalledWith('Session expired. Please sign in again.');
  });

  it('falls back to a readable message when a 401 carries no body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => Promise.reject() });

    await expect(
      requestBlob('/operations/media/1', { apiBaseUrl: 'http://api.test', sessionToken: 't' })
    ).rejects.toThrow('Your session has ended. Please sign in again.');

    expect(unauthorizedListener).toHaveBeenCalledWith(
      'Your session has ended. Please sign in again.'
    );
  });

  it('leaves other failures to the caller without touching the session', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'Database unavailable.' }));

    await expect(
      requestJson('/operations/jobs/queue', { apiBaseUrl: 'http://api.test', sessionToken: 't' })
    ).rejects.toThrow('Database unavailable.');

    expect(unauthorizedListener).not.toHaveBeenCalled();
  });

  it('returns parsed JSON and blobs on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(requestJson('/health', { apiBaseUrl: 'http://api.test' })).resolves.toEqual({
      ok: true
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, null));
    const blob = await requestBlob('/operations/media/1', { apiBaseUrl: 'http://api.test' });
    expect(blob.size).toBeGreaterThan(0);
    expect(unauthorizedListener).not.toHaveBeenCalled();
  });
});
