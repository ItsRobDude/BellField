import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOfficePurchaseOrder, listOfficePurchaseOrders } from './operations-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-api purchasing read helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists purchase orders and loads one with office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ purchaseOrders: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ purchaseOrder: { id: 'po-1', lines: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await listOfficePurchaseOrders({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await getOfficePurchaseOrder({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      purchaseOrderId: 'po-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/purchase-orders',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/purchase-orders/po-1',
      expect.anything()
    );
  });
});
