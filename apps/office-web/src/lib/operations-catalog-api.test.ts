import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOfficeCatalogItem,
  getOfficeCatalogItems,
  updateOfficeCatalogItem
} from './operations-catalog-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-catalog-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls catalog read and write endpoints with office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ items: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ item: { id: 'catalog-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ item: { id: 'catalog-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = { sessionToken: 'session-token', apiBaseUrl: 'http://api.test' };

    await getOfficeCatalogItems(auth);
    await createOfficeCatalogItem({
      ...auth,
      body: { name: 'Diagnostic', kind: 'service' }
    });
    await updateOfficeCatalogItem({
      ...auth,
      catalogItemId: 'catalog-1',
      body: {
        name: 'Diagnostic',
        kind: 'service',
        taxableDefault: true,
        fieldVisible: true,
        isActive: true
      }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/catalog/items',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/catalog/items',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/catalog/items/catalog-1',
      expect.objectContaining({ method: 'PUT' })
    );
  });
});
