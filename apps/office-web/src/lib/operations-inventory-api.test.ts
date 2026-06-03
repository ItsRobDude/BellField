import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOfficeInventoryAdjustment,
  createOfficeInventoryItem,
  createOfficeInventoryLocation,
  createOfficeInventoryTransfer,
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  getOfficeInventoryMovements,
  getOfficeInventoryOnHand,
  issueOfficeInventoryToJob,
  updateOfficeInventoryItem,
  updateOfficeInventoryLocation
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

describe('operations-api inventory write helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts catalog, location, and stock-action writes to the right endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ item: { id: 'item-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ item: { id: 'item-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ location: { id: 'loc-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ location: { id: 'loc-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ rows: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ rows: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ rows: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = { sessionToken: 'session-token', apiBaseUrl: 'http://api.test' };
    await createOfficeInventoryItem({ ...auth, body: { name: 'Capacitor', kind: 'part' } });
    await updateOfficeInventoryItem({
      ...auth,
      itemId: 'item-1',
      body: { name: 'Capacitor', kind: 'part', isActive: false }
    });
    await createOfficeInventoryLocation({ ...auth, body: { name: 'Truck 1', kind: 'truck' } });
    await updateOfficeInventoryLocation({
      ...auth,
      locationId: 'loc-1',
      body: { name: 'Truck 1', kind: 'truck', isActive: true }
    });
    await createOfficeInventoryAdjustment({
      ...auth,
      body: { itemId: 'item-1', locationId: 'loc-1', quantityDelta: 5, unitCost: 8 }
    });
    await createOfficeInventoryTransfer({
      ...auth,
      body: { itemId: 'item-1', fromLocationId: 'loc-1', toLocationId: 'loc-2', quantity: 2 }
    });
    await issueOfficeInventoryToJob({
      ...auth,
      body: { itemId: 'item-1', locationId: 'loc-1', jobId: 'job-1', quantity: 1 }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/inventory/items',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/inventory/items/item-1',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/inventory/locations',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/operations/inventory/locations/loc-1',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/operations/inventory/adjustments',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://api.test/operations/inventory/transfers',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'http://api.test/operations/inventory/issues',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
