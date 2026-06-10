import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '@/lib/operations-api';
import { EstimateCatalogPicker } from './job-estimate-catalog-picker';
import type { EstimateLineDraft } from './job-estimate-types';

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'catalog-1',
    name: 'Cooling diagnostic',
    kind: 'service',
    category: 'Diagnostics',
    tradeTags: [],
    taxableDefault: true,
    defaultSalePrice: 129,
    fieldVisible: true,
    isActive: true,
    registerUsageCount: 0,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  };
}

function renderPicker(input: {
  items: CatalogItem[];
  searchText?: string;
  onAddLine?: (line: EstimateLineDraft) => void;
}) {
  const onSearchChange = vi.fn();
  const onAddLine = input.onAddLine ?? vi.fn<(line: EstimateLineDraft) => void>();
  render(
    <EstimateCatalogPicker
      items={input.items}
      searchText={input.searchText ?? ''}
      isLoading={false}
      onSearchChange={onSearchChange}
      onReload={vi.fn()}
      onAddLine={onAddLine}
    />
  );
  return { onSearchChange, onAddLine };
}

describe('EstimateCatalogPicker', () => {
  it('shows categories instead of random item cards when search is blank', () => {
    renderPicker({
      items: [
        catalogItem({ id: 'diagnostic', name: 'Cooling diagnostic', category: 'Diagnostics' }),
        catalogItem({ id: 'filter', name: '16x20x1 filter', category: 'Materials' }),
        catalogItem({ id: 'trip', name: 'Trip fee', category: 'Fees' })
      ]
    });

    expect(screen.getByRole('button', { name: /Diagnostics\s*1 items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fees\s*1 items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Materials\s*1 items/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cooling diagnostic/i })).toBeNull();
  });

  it('opens one category before adding an item', () => {
    renderPicker({
      items: [
        catalogItem({ id: 'diagnostic', name: 'Cooling diagnostic', category: 'Diagnostics' }),
        catalogItem({ id: 'filter', name: '16x20x1 filter', category: 'Materials' })
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: /Diagnostics\s*1 items/i }));

    expect(screen.getByRole('button', { name: /Cooling diagnostic/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /16x20x1 filter/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All categories' }));
    expect(screen.getByRole('button', { name: /Materials\s*1 items/i })).toBeInTheDocument();
  });

  it('searches items directly and preserves catalog tax defaults when adding', () => {
    const onAddLine = vi.fn();
    renderPicker({
      searchText: 'filter',
      onAddLine,
      items: [
        catalogItem({ id: 'diagnostic', name: 'Cooling diagnostic', category: 'Diagnostics' }),
        catalogItem({
          id: 'filter',
          name: '16x20x1 filter',
          category: 'Materials',
          kind: 'part',
          taxableDefault: false
        })
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: /16x20x1 filter/i }));

    expect(screen.queryByRole('button', { name: /Diagnostics\s*1 items/i })).toBeNull();
    expect(onAddLine).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '16x20x1 filter',
        taxable: false,
        catalogItemId: 'filter'
      })
    );
  });
});
