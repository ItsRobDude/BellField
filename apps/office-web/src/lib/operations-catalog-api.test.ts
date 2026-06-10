import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOfficeCatalogCategory,
  createOfficeCatalogItem,
  getOfficeCatalogCategories,
  getOfficeCatalogItems,
  updateOfficeCatalogCategory,
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
      .mockResolvedValueOnce(mockJsonResponse({ categories: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ item: { id: 'catalog-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ item: { id: 'catalog-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ category: { id: 'category-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ category: { id: 'category-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = { sessionToken: 'session-token', apiBaseUrl: 'http://api.test' };

    await getOfficeCatalogItems(auth);
    await getOfficeCatalogCategories(auth);
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
    await createOfficeCatalogCategory({
      ...auth,
      body: { name: 'Maintenance', sortOrder: 10, defaultTaxable: true }
    });
    await updateOfficeCatalogCategory({
      ...auth,
      catalogCategoryId: 'category-1',
      body: {
        name: 'Maintenance',
        sortOrder: 10,
        isActive: true,
        defaultTaxable: true
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
      'http://api.test/operations/catalog/categories',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/catalog/items',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/operations/catalog/items/catalog-1',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/operations/catalog/categories',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://api.test/operations/catalog/categories/category-1',
      expect.objectContaining({ method: 'PUT' })
    );
  });
});
