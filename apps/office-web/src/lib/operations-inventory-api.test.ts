import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  getOfficeInventoryMovements,
  getOfficeInventoryOnHand
} from './operations-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-api inventory read helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the inventory read endpoints with office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ rows: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ items: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ locations: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ movements: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getOfficeInventoryOnHand({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await getOfficeInventoryItems({ sessionToken: 'session-token', apiBaseUrl: 'http://api.test' });
    await getOfficeInventoryLocations({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await getOfficeInventoryMovements({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/inventory/on-hand',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/inventory/items',
      expect.anything()
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/inventory/locations',
      expect.anything()
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/operations/inventory/movements',
      expect.anything()
    );
  });

  it('appends item and job filters to the movements query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ movements: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getOfficeInventoryMovements({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      itemId: 'item-1',
      jobId: 'job-1'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/operations/inventory/movements?itemId=item-1&jobId=job-1',
      expect.anything()
    );
  });
});
