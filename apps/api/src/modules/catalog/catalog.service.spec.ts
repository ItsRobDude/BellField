import { CatalogService } from './catalog.service';
import type { CatalogItem } from '@bellfield/contracts';

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'catalog-1',
    name: 'Compressor',
    kind: 'part',
    tradeTags: ['hvac'],
    taxableDefault: true,
    defaultSalePrice: 500,
    internalNotes: 'Vendor-only note',
    costHint: 275,
    incomeCategory: 'Parts',
    accountingExportCode: '4000',
    fieldVisible: true,
    isActive: true,
    registerUsageCount: 0,
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    ...overrides
  };
}

function createService(effectivePermissions: string[]) {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'employee-1',
      displayName: 'Viewer',
      effectivePermissions,
      sessionSurface: 'office-web'
    })
  };
  const catalogRepository = {
    listFieldItems: jest.fn().mockResolvedValue([]),
    listItems: jest.fn().mockResolvedValue([catalogItem()]),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    getItemById: jest.fn(),
    inventoryItemExists: jest.fn()
  };

  return {
    service: new CatalogService(identityAccessService as never, catalogRepository as never),
    catalogRepository
  };
}

describe('CatalogService', () => {
  it('strips internal cost and accounting fields for read-only Catalog viewers', async () => {
    const { service } = createService(['catalog:view']);

    const result = await service.listItems('token');

    expect(result.items[0]).toMatchObject({
      id: 'catalog-1',
      name: 'Compressor',
      defaultSalePrice: 500
    });
    expect(result.items[0].internalNotes).toBeUndefined();
    expect(result.items[0].costHint).toBeUndefined();
    expect(result.items[0].incomeCategory).toBeUndefined();
    expect(result.items[0].accountingExportCode).toBeUndefined();
  });

  it('keeps internal fields for Catalog editors', async () => {
    const { service } = createService(['catalog:view', 'catalog:edit']);

    const result = await service.listItems('token');

    expect(result.items[0].internalNotes).toBe('Vendor-only note');
    expect(result.items[0].costHint).toBe(275);
    expect(result.items[0].incomeCategory).toBe('Parts');
    expect(result.items[0].accountingExportCode).toBe('4000');
  });
});
