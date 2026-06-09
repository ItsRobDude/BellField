import { describe, expect, it } from 'vitest';
import type { FieldCatalogItem, FieldTruckStockItem } from '@bellfield/contracts';
import { buildRegisterSearchResults } from '../field-register-search';
import {
  buildPricedRegisterDraftPatch,
  createCatalogRegisterDraftPatch,
  createRegisterEntryDraft
} from '../field-workspace-drafts';

const baseCatalogItem: FieldCatalogItem = {
  id: 'catalog-diagnostic',
  code: 'SVC-DX',
  name: 'Diagnostic visit',
  kind: 'service',
  category: 'Diagnostics',
  tradeTags: ['General'],
  description: 'Diagnose the issue.',
  unitOfMeasure: 'visit',
  taxableDefault: true,
  defaultSalePrice: 129,
  updatedAt: '2026-06-08T12:00:00.000Z'
};

const truckStockItem: FieldTruckStockItem = {
  itemId: 'inventory-capacitor',
  sku: 'CAP-45',
  itemName: '45/5 capacitor',
  unitOfMeasure: 'each',
  locationId: 'truck-1',
  locationName: 'Truck 1',
  quantityOnHand: 3
};

describe('field register add-work helpers', () => {
  it('searches Catalog items and truck stock together', () => {
    const results = buildRegisterSearchResults([baseCatalogItem], [truckStockItem], 'capacitor');

    expect(results.map((result) => result.id)).toEqual([
      'truck:inventory-capacitor:truck-1',
      'custom'
    ]);
  });

  it('prefers a linked Catalog result over a duplicate truck-stock result', () => {
    const results = buildRegisterSearchResults(
      [{ ...baseCatalogItem, linkedInventoryItemId: 'inventory-capacitor' }],
      [truckStockItem],
      'diagnostic'
    );

    expect(results.map((result) => result.id)).toEqual(['catalog:catalog-diagnostic', 'custom']);
  });

  it('carries Catalog labor into a time-based draft and recalculates total from hours', () => {
    const draft = {
      ...createRegisterEntryDraft(),
      ...createCatalogRegisterDraftPatch(
        {
          ...baseCatalogItem,
          id: 'catalog-after-hours-labor',
          code: 'LAB-AH',
          name: 'After-hours labor',
          kind: 'labor',
          unitOfMeasure: 'hour',
          defaultSalePrice: 175
        },
        []
      )
    };

    expect(draft.registerEntryKind).toBe('labor');
    expect(draft.unitPrice).toBe('175');
    expect(buildPricedRegisterDraftPatch(draft, { quantity: '1.5' })).toMatchObject({
      quantity: '1.5',
      totalAmount: '262.5'
    });
  });

  it('keeps service planned labor as snapshot context instead of changing the flat price', () => {
    const patch = createCatalogRegisterDraftPatch(
      { ...baseCatalogItem, estimatedLaborHours: 2 },
      []
    );

    expect(patch.totalAmount).toBe('129');
    expect(patch.catalogSnapshot?.estimatedLaborHours).toBe(2);
  });

  it('preserves structured truck-stock refs for linked Catalog parts', () => {
    const patch = createCatalogRegisterDraftPatch(
      {
        ...baseCatalogItem,
        id: 'catalog-capacitor',
        kind: 'part',
        linkedInventoryItemId: 'inventory-capacitor',
        linkedInventoryItemSku: 'CAP-45',
        linkedInventoryItemName: '45/5 capacitor'
      },
      [truckStockItem]
    );

    expect(patch).toMatchObject({
      registerEntryKind: 'part',
      inventoryItemId: 'inventory-capacitor',
      inventoryLocationId: 'truck-1',
      inventorySourceLabel: 'Truck 1'
    });
  });
});
