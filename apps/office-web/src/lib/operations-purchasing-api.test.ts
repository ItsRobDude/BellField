import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOfficePurchaseOrder,
  getOfficePurchaseOrder,
  listOfficePurchaseOrders,
  orderOfficePurchaseOrder,
  receiveOfficePurchaseOrder
} from './operations-api';

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

  it('creates, orders, and receives purchase orders at the right endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ purchaseOrder: { id: 'po-1', lines: [] } }))
      .mockResolvedValueOnce(mockJsonResponse({ purchaseOrder: { id: 'po-1', lines: [] } }))
      .mockResolvedValueOnce(mockJsonResponse({ purchaseOrder: { id: 'po-1', lines: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = { sessionToken: 'session-token', apiBaseUrl: 'http://api.test' };
    await createOfficePurchaseOrder({
      ...auth,
      body: {
        vendorName: 'Acme',
        destinationInventoryLocationId: 'loc-1',
        lines: [{ kind: 'part', description: 'Capacitor', quantity: 2, expectedUnitCost: 12.5 }]
      }
    });
    await orderOfficePurchaseOrder({ ...auth, purchaseOrderId: 'po-1' });
    await receiveOfficePurchaseOrder({ ...auth, purchaseOrderId: 'po-1', body: {} });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/purchase-orders',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/purchase-orders/po-1/order',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/purchase-orders/po-1/receive',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
