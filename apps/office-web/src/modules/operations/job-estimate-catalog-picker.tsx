'use client';

import type { CSSProperties } from 'react';
import type { CatalogItem, CatalogItemKind, CatalogLineSnapshot } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { EstimateLineDraft } from './job-estimate-types';

type EstimateCatalogPickerProps = {
  items: CatalogItem[];
  searchText: string;
  isLoading: boolean;
  onSearchChange: (value: string) => void;
  onReload: () => void;
  onAddLine: (line: EstimateLineDraft) => void;
};

export function EstimateCatalogPicker({
  items,
  searchText,
  isLoading,
  onSearchChange,
  onReload,
  onAddLine
}: EstimateCatalogPickerProps) {
  const matchingCatalogItems = filterCatalogItems(items, searchText);

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
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search name, code, category, or tag"
      />
      {isLoading ? (
        <p style={styles.tinyMuted}>Loading Catalog...</p>
      ) : matchingCatalogItems.length === 0 ? (
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
      )}
    </div>
  );
}

function filterCatalogItems(items: CatalogItem[], searchText: string): CatalogItem[] {
  const search = searchText.trim().toLocaleLowerCase();
  return items
    .filter((item) => item.isActive && item.kind !== 'discount')
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
