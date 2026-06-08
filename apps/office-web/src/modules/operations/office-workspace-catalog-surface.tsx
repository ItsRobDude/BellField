'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createOfficeCatalogItem,
  getOfficeCatalogItems,
  getOfficeInventoryItems,
  updateOfficeCatalogItem,
  type CatalogItem,
  type CatalogItemKind,
  type CreateCatalogItemRequest,
  type InventoryItem,
  type UpdateCatalogItemRequest
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';
import {
  CatalogForm,
  draftFromCatalogItem,
  emptyCatalogDraft,
  type ActiveCatalogForm,
  type CatalogDraft
} from './office-workspace-catalog-forms';

export type OfficeCatalogSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  canViewInventory: boolean;
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

export function OfficeCatalogSurface({
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit,
  canViewInventory
}: OfficeCatalogSurfaceProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveCatalogForm | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [catalogResult, inventoryResult] = await Promise.all([
        getOfficeCatalogItems({ apiBaseUrl, sessionToken }),
        canViewInventory
          ? getOfficeInventoryItems({ apiBaseUrl, sessionToken })
          : Promise.resolve({ items: [] })
      ]);
      setItems(catalogResult.items);
      setInventoryItems(inventoryResult.items);
      setHasLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load catalog.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, canViewInventory, sessionToken]);

  const inventoryLinkOptions = useMemo(() => {
    const byId = new Map(inventoryItems.map((item) => [item.id, { id: item.id, name: item.name }]));
    for (const item of items) {
      if (item.linkedInventoryItemId && item.linkedInventoryItemName) {
        byId.set(item.linkedInventoryItemId, {
          id: item.linkedInventoryItemId,
          name: item.linkedInventoryItemName
        });
      }
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [inventoryItems, items]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (!showInactive && !item.isActive) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        item.name,
        item.code,
        item.category,
        item.description,
        item.linkedInventoryItemName,
        ...item.tradeTags
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(search));
    });
  }, [items, searchText, showInactive]);

  async function afterWrite(message: string) {
    setNoticeMessage(message);
    setActiveForm(null);
    await load();
  }

  async function submitForm() {
    if (!activeForm) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      if (activeForm.editingId) {
        await updateOfficeCatalogItem({
          apiBaseUrl,
          sessionToken,
          catalogItemId: activeForm.editingId,
          body: toUpdateRequest(activeForm.draft)
        });
        await afterWrite('Catalog item updated.');
      } else {
        await createOfficeCatalogItem({
          apiBaseUrl,
          sessionToken,
          body: toCreateRequest(activeForm.draft)
        });
        await afterWrite('Catalog item created.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save catalog item.');
    } finally {
      setIsSaving(false);
    }
  }

  const formOpen = activeForm !== null;

  return (
    <section style={styles.workspacePanel} aria-label="Catalog">
      <div style={styles.row}>
        <div>
          <h1 style={styles.heading}>Catalog</h1>
          <p style={styles.tinyMuted}>Sellable services, parts, fees, agreements, and discounts.</p>
        </div>
        <div style={styles.inlineActionBar}>
          {canCreate ? (
            <button
              type="button"
              style={styles.button}
              disabled={isSaving || formOpen}
              onClick={() => setActiveForm({ editingId: null, draft: emptyCatalogDraft })}
            >
              Add item
            </button>
          ) : null}
          <button
            type="button"
            style={styles.button}
            disabled={isLoading}
            onClick={() => void load()}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      <div style={styles.panel}>
        <div style={styles.formGridCompact}>
          <label style={styles.fieldLabel}>
            Search
            <input
              style={styles.input}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          <label style={styles.inlineLabel}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show inactive
          </label>
        </div>
      </div>

      {activeForm ? (
        <CatalogForm
          form={activeForm}
          inventoryItems={inventoryLinkOptions}
          isSaving={isSaving}
          onChange={setActiveForm}
          onCancel={() => setActiveForm(null)}
          onSubmit={() => void submitForm()}
        />
      ) : null}

      {hasLoaded ? (
        <CatalogPanel
          title="Items"
          count={visibleItems.length}
          emptyText="No catalog items match the current filters."
        >
          <Table
            head={[
              'Item',
              'Kind',
              'Price',
              ...(canEdit ? ['Cost'] : []),
              'Inventory',
              'Field',
              'Used',
              'Status',
              ''
            ]}
          >
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td style={styles.tableCell}>
                  <strong>{item.name}</strong>
                  <p style={styles.tinyMuted}>{item.code ?? item.category ?? 'No code'}</p>
                  {item.tradeTags.length ? (
                    <div style={styles.badgeRow}>
                      {item.tradeTags.map((tag) => (
                        <span key={tag} style={styles.badge}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td style={styles.tableCell}>{kindLabels[item.kind]}</td>
                <td style={styles.tableCell}>
                  {formatCatalogPrice(item)}
                  {item.agreementPrice !== undefined ? (
                    <p style={styles.tinyMuted}>Agreement {formatCurrency(item.agreementPrice)}</p>
                  ) : null}
                </td>
                {canEdit ? (
                  <td style={styles.tableCell}>
                    {item.costHint === undefined ? '-' : formatCurrency(item.costHint)}
                  </td>
                ) : null}
                <td style={styles.tableCell}>{item.linkedInventoryItemName ?? '-'}</td>
                <td style={styles.tableCell}>
                  <span style={item.fieldVisible ? styles.badge : styles.dangerBadge}>
                    {item.fieldVisible ? 'Visible' : 'Office only'}
                  </span>
                </td>
                <td style={styles.tableCell}>{item.registerUsageCount}</td>
                <td style={styles.tableCell}>
                  <span style={item.isActive ? styles.badge : styles.dangerBadge}>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={styles.tableCell}>
                  {canEdit ? (
                    <button
                      type="button"
                      style={styles.tableLinkButton}
                      disabled={isSaving || formOpen}
                      onClick={() =>
                        setActiveForm({
                          editingId: item.id,
                          draft: draftFromCatalogItem(item)
                        })
                      }
                    >
                      Edit
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </CatalogPanel>
      ) : isLoading ? (
        <p style={styles.muted}>Loading catalog...</p>
      ) : null}
    </section>
  );
}

function CatalogPanel({
  title,
  count,
  emptyText,
  children
}: {
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h2 style={styles.heading}>{title}</h2>
        <span style={styles.badge}>{count}</span>
      </div>
      {count === 0 ? (
        <p style={styles.muted}>{emptyText}</p>
      ) : (
        <div style={styles.tableWrap}>{children}</div>
      )}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {head.map((label, index) => (
            <th key={label || `col-${index}`} style={styles.tableHeadCell}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function formatCatalogPrice(item: CatalogItem): string {
  if (item.defaultSalePrice === undefined) {
    return '-';
  }
  return formatCurrency(item.defaultSalePrice);
}

function toCreateRequest(draft: CatalogDraft): CreateCatalogItemRequest {
  return {
    code: emptyToUndefined(draft.code),
    name: draft.name.trim(),
    kind: draft.kind,
    category: emptyToUndefined(draft.category),
    tradeTags: splitTags(draft.tradeTags),
    description: emptyToUndefined(draft.description),
    internalNotes: emptyToUndefined(draft.internalNotes),
    unitOfMeasure: emptyToUndefined(draft.unitOfMeasure),
    taxableDefault: draft.taxableDefault,
    defaultSalePrice: parseOptionalNumber(draft.defaultSalePrice),
    agreementPrice: parseOptionalNumber(draft.agreementPrice),
    estimatedLaborHours: parseOptionalNumber(draft.estimatedLaborHours),
    costHint: parseOptionalNumber(draft.costHint),
    linkedInventoryItemId: emptyToUndefined(draft.linkedInventoryItemId),
    incomeCategory: emptyToUndefined(draft.incomeCategory),
    accountingExportCode: emptyToUndefined(draft.accountingExportCode),
    fieldVisible: draft.fieldVisible
  };
}

function toUpdateRequest(draft: CatalogDraft): UpdateCatalogItemRequest {
  return {
    ...toCreateRequest(draft),
    taxableDefault: draft.taxableDefault,
    fieldVisible: draft.fieldVisible,
    isActive: draft.isActive
  };
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error('Enter a valid number.');
  }
  return parsed;
}

function splitTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of value.split(',')) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}
