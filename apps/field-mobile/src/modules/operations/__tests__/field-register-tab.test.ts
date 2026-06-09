import { describe, expect, it } from 'vitest';
import type { FieldCatalogItem, FieldTruckStockItem } from '@bellfield/contracts';
import {
  formatDraftTotalLabel,
  isDraftCoherentForSelectedResult
} from '../field-register-composer-state';
import { buildRegisterSearchResults } from '../field-register-search';
import { createRegisterAddLineGate } from '../field-register-submit-guard';
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
  it('keeps blank search from rendering the full Catalog wall', () => {
    const results = buildRegisterSearchResults([baseCatalogItem], [truckStockItem], '');

    expect(results).toEqual([]);
  });

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

  it('guards Add line so a second in-flight tap cannot queue another operation', async () => {
    const gate = createRegisterAddLineGate();
    let calls = 0;
    let releaseFirst: (() => void) | undefined;
    const first = gate.run(
      () =>
        new Promise<boolean>((resolve) => {
          calls += 1;
          releaseFirst = () => resolve(true);
        })
    );
    const second = await gate.run(async () => {
      calls += 1;
      return true;
    });

    releaseFirst?.();

    await expect(first).resolves.toBe(true);
    expect(second).toBe(false);
    expect(calls).toBe(1);
    expect(gate.isAdding()).toBe(false);
  });

  it('treats a successful Catalog selection as coherent and a reset draft as stale', () => {
    const selectedResult = {
      id: 'catalog:catalog-diagnostic',
      kind: 'catalog',
      item: baseCatalogItem
    } as const;
    const selectedDraft = {
      ...createRegisterEntryDraft(),
      ...createCatalogRegisterDraftPatch(baseCatalogItem, [])
    };

    expect(isDraftCoherentForSelectedResult(selectedDraft, selectedResult)).toBe(true);
    expect(isDraftCoherentForSelectedResult(createRegisterEntryDraft(), selectedResult)).toBe(
      false
    );
  });

  it('shows price-not-set for incomplete pricing instead of fake zero dollars', () => {
    expect(formatDraftTotalLabel(createRegisterEntryDraft({ totalAmount: 0 }))).toBe(
      'Price not set'
    );
    expect(
      formatDraftTotalLabel({
        ...createRegisterEntryDraft({ totalAmount: 0 }),
        unitPrice: '0'
      })
    ).toBe('$0.00');
  });
});
