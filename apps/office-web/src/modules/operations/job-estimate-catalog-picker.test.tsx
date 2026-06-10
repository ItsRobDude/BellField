import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogCategory, CatalogItem } from '@/lib/operations-api';
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

function catalogCategory(overrides: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id: 'category-1',
    name: 'Diagnostics',
    sortOrder: 10,
    isActive: true,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  };
}

function renderPicker(input: {
  items: CatalogItem[];
  categories?: CatalogCategory[];
  searchText?: string;
  onAddLine?: (line: EstimateLineDraft) => void;
}) {
  const onSearchChange = vi.fn();
  const onAddLine = input.onAddLine ?? vi.fn<(line: EstimateLineDraft) => void>();
  render(
    <EstimateCatalogPicker
      items={input.items}
      categories={input.categories ?? []}
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

  it('uses managed category order and routes inactive-category items to the fallback bucket', () => {
    renderPicker({
      categories: [
        catalogCategory({ id: 'diagnostics', name: 'Diagnostics', sortOrder: 20 }),
        catalogCategory({ id: 'after-hours', name: 'After hours', sortOrder: 10 }),
        catalogCategory({ id: 'old', name: 'Old category', sortOrder: 30, isActive: false })
      ],
      items: [
        catalogItem({ id: 'diagnostic', name: 'Cooling diagnostic', category: 'Diagnostics' }),
        catalogItem({ id: 'after-hours', name: 'After-hours labor', category: 'After hours' }),
        catalogItem({ id: 'old-item', name: 'Old stocked part', category: 'Old category' })
      ]
    });

    const categoryButtons = screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((text) => text.includes('items'));
    expect(categoryButtons[0]).toMatch(/After hours/);
    expect(categoryButtons[1]).toMatch(/Diagnostics/);
    expect(categoryButtons[2]).toMatch(/Uncategorized/);
    expect(screen.queryByRole('button', { name: /Old category\s*1 items/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Uncategorized\s*1 items/i }));

    expect(screen.getByRole('button', { name: /Old stocked part/i })).toBeInTheDocument();
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
