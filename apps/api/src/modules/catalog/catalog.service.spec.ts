import { CatalogService } from './catalog.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CatalogCategory, CatalogItem } from '@bellfield/contracts';

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

function catalogCategory(overrides: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id: 'category-1',
    name: 'Maintenance',
    sortOrder: 10,
    isActive: true,
    defaultTaxable: true,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
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
    listCategories: jest.fn().mockResolvedValue([catalogCategory()]),
    getCategoryById: jest.fn(),
    getCategoryByName: jest.fn().mockResolvedValue(null),
    categoryNameExists: jest.fn().mockResolvedValue(false),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
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

  it('applies an active category tax default when creating a Catalog item without an explicit default', async () => {
    const { service, catalogRepository } = createService(['catalog:create']);
    catalogRepository.getCategoryByName.mockResolvedValue(
      catalogCategory({ name: 'Materials', defaultTaxable: false })
    );
    catalogRepository.createItem.mockResolvedValue(catalogItem({ taxableDefault: false }));

    await service.createItem('token', {
      name: '16x20x1 filter',
      kind: 'part',
      category: 'Materials'
    });

    expect(catalogRepository.getCategoryByName).toHaveBeenCalledWith('Materials');
    expect(catalogRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '16x20x1 filter',
        taxableDefault: false
      })
    );
  });

  it('respects explicit Catalog item taxability over the category default', async () => {
    const { service, catalogRepository } = createService(['catalog:create']);
    catalogRepository.createItem.mockResolvedValue(catalogItem({ taxableDefault: true }));

    await service.createItem('token', {
      name: 'Permit fee',
      kind: 'fee',
      category: 'Fees',
      taxableDefault: true
    });

    expect(catalogRepository.getCategoryByName).not.toHaveBeenCalled();
    expect(catalogRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ taxableDefault: true })
    );
  });

  it('lists managed catalog categories behind catalog view permission', async () => {
    const { service, catalogRepository } = createService(['catalog:view']);

    const result = await service.listCategories('token');

    expect(result.categories).toEqual([catalogCategory()]);
    expect(catalogRepository.listCategories).toHaveBeenCalledTimes(1);
  });

  it('creates a managed category with normalized input after duplicate-name validation', async () => {
    const { service, catalogRepository } = createService(['catalog:create']);
    catalogRepository.createCategory.mockResolvedValue(catalogCategory({ name: 'Service' }));

    const result = await service.createCategory('token', {
      name: ' Service ',
      sortOrder: 20,
      defaultTaxable: false
    });

    expect(result.category.name).toBe('Service');
    expect(catalogRepository.categoryNameExists).toHaveBeenCalledWith('Service', undefined);
    expect(catalogRepository.createCategory).toHaveBeenCalledWith({
      name: ' Service ',
      sortOrder: 20,
      defaultTaxable: false
    });
  });

  it('rejects duplicate managed category names', async () => {
    const { service, catalogRepository } = createService(['catalog:create']);
    catalogRepository.categoryNameExists.mockResolvedValue(true);

    await expect(
      service.createCategory('token', { name: 'Maintenance', sortOrder: 10 })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(catalogRepository.createCategory).not.toHaveBeenCalled();
  });

  it('maps concurrent category create unique violations to a friendly duplicate error', async () => {
    const { service, catalogRepository } = createService(['catalog:create']);
    catalogRepository.createCategory.mockRejectedValue({ code: '23505' });

    await expect(
      service.createCategory('token', { name: 'Maintenance', sortOrder: 10 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates a managed category only when it exists', async () => {
    const { service, catalogRepository } = createService(['catalog:edit']);
    catalogRepository.getCategoryById
      .mockResolvedValueOnce(catalogCategory())
      .mockResolvedValueOnce(catalogCategory({ name: 'Service' }));

    const result = await service.updateCategory('token', 'category-1', {
      name: 'Service',
      sortOrder: 20,
      isActive: true
    });

    expect(result.category.name).toBe('Service');
    // The previous name rides along so the repository can cascade the rename
    // to items that reference the category by free-text name.
    expect(catalogRepository.updateCategory).toHaveBeenCalledWith(
      'category-1',
      {
        name: 'Service',
        sortOrder: 20,
        isActive: true
      },
      'Maintenance'
    );
  });

  it('maps concurrent category update unique violations to a friendly duplicate error', async () => {
    const { service, catalogRepository } = createService(['catalog:edit']);
    catalogRepository.getCategoryById.mockResolvedValue(catalogCategory());
    catalogRepository.updateCategory.mockRejectedValue({ code: '23505' });

    await expect(
      service.updateCategory('token', 'category-1', {
        name: 'Service',
        sortOrder: 20,
        isActive: true
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects updates for missing managed categories', async () => {
    const { service, catalogRepository } = createService(['catalog:edit']);
    catalogRepository.getCategoryById.mockResolvedValue(null);

    await expect(
      service.updateCategory('token', 'missing', {
        name: 'Service',
        sortOrder: 20,
        isActive: true
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(catalogRepository.updateCategory).not.toHaveBeenCalled();
  });
});
