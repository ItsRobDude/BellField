import type { FieldCatalogItem, FieldTruckStockItem } from '@/lib/operations-api';

export type RegisterSearchResult =
  | { id: string; kind: 'catalog'; item: FieldCatalogItem; truckMatch?: FieldTruckStockItem }
  | { id: string; kind: 'truckStock'; item: FieldTruckStockItem }
  | { id: string; kind: 'custom' };

export function buildRegisterSearchResults(
  catalogItems: FieldCatalogItem[],
  truckStockItems: FieldTruckStockItem[],
  queryValue: string
): RegisterSearchResult[] {
  const query = queryValue.trim().toLowerCase();
  if (!query) {
    return [];
  }

  const catalogResults: RegisterSearchResult[] = catalogItems
    .filter((item) => matchesCatalogItem(item, query))
    .slice(0, 8)
    .map((item) => ({
      id: `catalog:${item.id}`,
      kind: 'catalog',
      item,
      truckMatch: findTruckMatchForCatalogItem(item, truckStockItems)
    }));
  const truckResults: RegisterSearchResult[] = truckStockItems
    .filter((item) => matchesTruckStockItem(item, query))
    .filter(
      (item) =>
        !catalogResults.some(
          (result) => result.kind === 'catalog' && result.item.linkedInventoryItemId === item.itemId
        )
    )
    .slice(0, 6)
    .map((item) => ({
      id: `truck:${item.itemId}:${item.locationId}`,
      kind: 'truckStock',
      item
    }));

  return [...catalogResults, ...truckResults].slice(0, 13);
}

export function findTruckMatchForCatalogItem(
  item: FieldCatalogItem,
  truckStockItems: FieldTruckStockItem[]
): FieldTruckStockItem | undefined {
  return item.linkedInventoryItemId
    ? truckStockItems.find((stockItem) => stockItem.itemId === item.linkedInventoryItemId)
    : undefined;
}

function matchesCatalogItem(item: FieldCatalogItem, query: string): boolean {
  return [
    item.name,
    item.code ?? '',
    item.category ?? '',
    item.description ?? '',
    item.linkedInventoryItemSku ?? '',
    item.linkedInventoryItemName ?? '',
    ...item.tradeTags
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function matchesTruckStockItem(item: FieldTruckStockItem, query: string): boolean {
  return [item.itemName, item.sku ?? '', item.locationName].join(' ').toLowerCase().includes(query);
}
