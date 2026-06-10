'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  CatalogCategory,
  CatalogItem,
  CatalogItemKind,
  CatalogLineSnapshot
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { EstimateLineDraft } from './job-estimate-types';

type EstimateCatalogPickerProps = {
  items: CatalogItem[];
  categories: CatalogCategory[];
  searchText: string;
  isLoading: boolean;
  onSearchChange: (value: string) => void;
  onReload: () => void;
  onAddLine: (line: EstimateLineDraft) => void;
};

export function EstimateCatalogPicker({
  items,
  categories: catalogCategories,
  searchText,
  isLoading,
  onSearchChange,
  onReload,
  onAddLine
}: EstimateCatalogPickerProps) {
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const quoteableItems = getQuoteableItems(items);
  const search = searchText.trim();
  const activeManagedCategoryKeys = new Set(
    catalogCategories
      .filter((category) => category.isActive)
      .map((category) => categoryKey(category.name))
  );
  const categories = summarizeCatalogCategories(quoteableItems, catalogCategories);
  const activeCategory = categories.find((category) => category.key === activeCategoryKey);
  const matchingCatalogItems = search
    ? filterCatalogItems(quoteableItems, search)
    : activeCategory
      ? quoteableItems.filter((item) =>
          itemMatchesCatalogCategory(item, activeCategory, activeManagedCategoryKeys)
        )
      : [];
  const showCategories = !isLoading && !search && !activeCategory && categories.length > 0;

  function handleSearchChange(value: string) {
    if (value.trim()) {
      setActiveCategoryKey(null);
    }
    onSearchChange(value);
  }

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <h5 style={styles.sectionHeading}>Catalog</h5>
        <button type="button" style={styles.button} disabled={isLoading} onClick={onReload}>
          Refresh
        </button>
      </div>
      <input
        style={styles.input}
        value={searchText}
        onChange={(event) => handleSearchChange(event.target.value)}
        placeholder="Search name, code, category, or tag"
      />
      {isLoading ? (
        <p style={styles.tinyMuted}>Loading Catalog...</p>
      ) : showCategories ? (
        <div style={catalogPickerGridStyle}>
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              style={catalogResultButtonStyle}
              onClick={() => setActiveCategoryKey(category.key)}
            >
              <span style={catalogResultTitleStyle}>{category.name}</span>
              <span style={styles.tinyMuted}>{category.count} items</span>
            </button>
          ))}
        </div>
      ) : !search && activeCategory ? (
        <div style={styles.inlineActionBar}>
          <button type="button" style={styles.button} onClick={() => setActiveCategoryKey(null)}>
            All categories
          </button>
          <span style={styles.fieldText}>{activeCategory.name}</span>
        </div>
      ) : null}
      {!showCategories ? (
        matchingCatalogItems.length === 0 ? (
          <p style={styles.tinyMuted}>No active quoteable Catalog items found.</p>
        ) : (
          <div style={catalogPickerGridStyle}>
            {matchingCatalogItems.map((item) => (
              <button
                key={item.id}
                type="button"
                style={catalogResultButtonStyle}
                onClick={() => onAddLine(createCatalogEstimateLine(item))}
              >
                <span style={catalogResultTitleStyle}>{item.name}</span>
                <span style={styles.tinyMuted}>
                  {kindLabels[item.kind]} · {formatCatalogPrice(item)}
                  {item.code ? ` · ${item.code}` : ''}
                </span>
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function getQuoteableItems(items: CatalogItem[]): CatalogItem[] {
  return items.filter((item) => item.isActive && item.kind !== 'discount');
}

function filterCatalogItems(items: CatalogItem[], searchText: string): CatalogItem[] {
  const search = searchText.trim().toLocaleLowerCase();
  return items
    .filter((item) => {
      if (!search) {
        return true;
      }
      const haystack = [
        item.name,
        item.code,
        item.category,
        item.description,
        item.linkedInventoryItemSku,
        item.linkedInventoryItemName,
        ...item.tradeTags
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return haystack.includes(search);
    })
    .slice(0, 12);
}

function summarizeCatalogCategories(
  items: CatalogItem[],
  catalogCategories: CatalogCategory[]
): CatalogCategorySummary[] {
  const activeManagedCategories = catalogCategories
    .filter((category) => category.isActive)
    .sort(compareManagedCategories);
  const managedCategoryMap = new Map<string, CatalogCategorySummary>();
  for (const category of activeManagedCategories) {
    managedCategoryMap.set(categoryKey(category.name), {
      key: categoryKey(category.name),
      name: category.name,
      count: 0,
      isFallback: false,
      sortOrder: category.sortOrder
    });
  }

  if (managedCategoryMap.size === 0) {
    return summarizeUnmanagedCatalogCategories(items);
  }

  const fallbackCategory: CatalogCategorySummary = {
    key: uncategorizedCategoryKey,
    name: 'Uncategorized',
    count: 0,
    isFallback: true,
    sortOrder: Number.MAX_SAFE_INTEGER
  };
  for (const item of items) {
    const key = categoryKey(item.category);
    const managedCategory = managedCategoryMap.get(key);
    if (managedCategory) {
      managedCategory.count += 1;
    } else {
      fallbackCategory.count += 1;
    }
  }
  const summaries = [...managedCategoryMap.values()].filter((category) => category.count > 0);
  if (fallbackCategory.count > 0) {
    summaries.push(fallbackCategory);
  }
  return summaries.sort(compareCatalogCategories);
}

function summarizeUnmanagedCatalogCategories(items: CatalogItem[]): CatalogCategorySummary[] {
  const categoryMap = new Map<string, CatalogCategorySummary>();
  for (const item of items) {
    const key = categoryKey(item.category);
    const existing = categoryMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      categoryMap.set(key, {
        key,
        name: normalizeCategoryName(item.category),
        count: 1,
        isFallback: key === uncategorizedCategoryKey,
        sortOrder: Number.MAX_SAFE_INTEGER
      });
    }
  }
  return [...categoryMap.values()].sort(compareCatalogCategories);
}

function categoryKey(category: string | undefined): string {
  return normalizeCategoryName(category).toLocaleLowerCase();
}

function normalizeCategoryName(category: string | undefined): string {
  const trimmed = category?.trim();
  return trimmed || 'Uncategorized';
}

function compareManagedCategories(left: CatalogCategory, right: CatalogCategory): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}

function compareCatalogCategories(
  left: CatalogCategorySummary,
  right: CatalogCategorySummary
): number {
  if (left.isFallback !== right.isFallback) {
    return left.isFallback ? 1 : -1;
  }
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}

function itemMatchesCatalogCategory(
  item: CatalogItem,
  category: CatalogCategorySummary,
  activeCategoryKeys: Set<string>
): boolean {
  const itemCategoryKey = categoryKey(item.category);
  if (category.isFallback) {
    return !activeCategoryKeys.has(itemCategoryKey);
  }
  return itemCategoryKey === category.key;
}

function createCatalogEstimateLine(item: CatalogItem): EstimateLineDraft {
  return {
    kind: estimateKindByCatalogKind[item.kind],
    description: item.description?.trim() || item.name,
    quantity: '1',
    unitOfMeasure: item.unitOfMeasure ?? '',
    unitPrice: item.defaultSalePrice === undefined ? '' : String(item.defaultSalePrice),
    unitCost: item.costHint === undefined ? '' : String(item.costHint),
    taxable: item.taxableDefault,
    catalogItemId: item.id,
    catalogSnapshot: toCatalogLineSnapshot(item)
  };
}

function toCatalogLineSnapshot(item: CatalogItem): CatalogLineSnapshot {
  return {
    catalogItemId: item.id,
    code: item.code,
    name: item.name,
    kind: item.kind,
    category: item.category,
    description: item.description,
    unitOfMeasure: item.unitOfMeasure,
    selectedUnitPrice: item.defaultSalePrice,
    taxable: item.taxableDefault,
    priceMode: 'standard',
    defaultSalePrice: item.defaultSalePrice,
    agreementPrice: item.agreementPrice,
    estimatedLaborHours: item.estimatedLaborHours,
    linkedInventoryItemId: item.linkedInventoryItemId,
    linkedInventoryItemSku: item.linkedInventoryItemSku,
    linkedInventoryItemName: item.linkedInventoryItemName
  };
}

function formatCatalogPrice(item: CatalogItem): string {
  if (item.defaultSalePrice === undefined) {
    return 'No price';
  }
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
    item.defaultSalePrice
  );
}

const estimateKindByCatalogKind: Record<CatalogItemKind, EstimateLineDraft['kind']> = {
  service: 'serviceItem',
  part: 'part',
  equipment: 'equipment',
  labor: 'labor',
  fee: 'other',
  discount: 'other',
  agreement: 'membership',
  other: 'other'
};

const kindLabels: Record<CatalogItemKind, string> = {
  service: 'Service',
  part: 'Part',
  equipment: 'Equipment',
  labor: 'Labor',
  fee: 'Fee',
  discount: 'Discount',
  agreement: 'Agreement',
  other: 'Other'
};

type CatalogCategorySummary = {
  key: string;
  name: string;
  count: number;
  isFallback: boolean;
  sortOrder: number;
};

const uncategorizedCategoryKey = 'uncategorized';

const catalogPickerGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
  marginTop: '0.65rem'
};

const catalogResultButtonStyle: CSSProperties = {
  ...styles.button,
  alignItems: 'flex-start',
  display: 'grid',
  gap: '0.2rem',
  justifyItems: 'start',
  minHeight: '4rem',
  textAlign: 'left'
};

const catalogResultTitleStyle: CSSProperties = {
  fontWeight: 800,
  overflowWrap: 'anywhere'
};
