'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  createOfficeInventoryAdjustment,
  createOfficeInventoryItem,
  createOfficeInventoryLocation,
  createOfficeInventoryTransfer,
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  getOfficeInventoryMovements,
  getOfficeInventoryOnHand,
  getOfficeJobsWorkspace,
  issueOfficeInventoryToJob,
  updateOfficeInventoryItem,
  updateOfficeInventoryLocation,
  type InventoryItem,
  type InventoryItemKind,
  type InventoryLocation,
  type InventoryLocationKind,
  type InventoryMovement,
  type InventoryMovementKind,
  type InventoryOnHandRow,
  type JobSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';
import {
  InventoryForm,
  emptyItemDraft,
  emptyLocationDraft,
  type ActiveForm
} from './office-workspace-inventory-forms';

export type OfficeInventorySurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  onOpenJob: (jobId: string) => void;
};

const itemKindLabels: Record<InventoryItemKind, string> = {
  part: 'Part',
  equipment: 'Equipment'
};

const locationKindLabels: Record<InventoryLocationKind, string> = {
  warehouse: 'Warehouse',
  truck: 'Truck / van',
  other: 'Other'
};

const movementKindLabels: Record<InventoryMovementKind, string> = {
  receiveToInventory: 'Received to stock',
  receiveToJob: 'Received to job',
  issueToJob: 'Issued to job',
  transfer: 'Transfer',
  adjustmentGain: 'Adjustment (gain)',
  adjustmentLoss: 'Adjustment (loss)',
  returnFromJob: 'Returned from job'
};

function formatQuantity(value: number): string {
  // Quantities are stored at 4-decimal precision; show up to 4 dp, trimming trailing zeros.
  return Number(value.toFixed(4)).toString();
}

// Inventory overview + write actions. Read panels (on-hand, items, locations, movements)
// plus a single active form for catalog/location edits and stock actions (adjust, transfer,
// issue-to-job), mirroring the single-editor pattern from the invoice corrections surface.
// All styling reuses officeWorkspaceStyles.
export function OfficeInventorySurface({
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit,
  onOpenJob
}: OfficeInventorySurfaceProps) {
  const [onHand, setOnHand] = useState<InventoryOnHandRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [onHandResult, itemsResult, locationsResult, movementsResult] = await Promise.all([
        getOfficeInventoryOnHand({ apiBaseUrl, sessionToken }),
        getOfficeInventoryItems({ apiBaseUrl, sessionToken }),
        getOfficeInventoryLocations({ apiBaseUrl, sessionToken }),
        getOfficeInventoryMovements({ apiBaseUrl, sessionToken })
      ]);
      setOnHand(onHandResult.rows);
      setItems(itemsResult.items);
      setLocations(locationsResult.locations);
      setMovements(movementsResult.movements);
      setHasLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load inventory.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // The issue-to-job job picker loads on demand the first time a stock issue is opened.
  const ensureJobs = useCallback(async () => {
    if (jobs) {
      return;
    }
    try {
      const workspace = await getOfficeJobsWorkspace({ apiBaseUrl, sessionToken });
      setJobs(workspace.jobs);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load jobs.');
    }
  }, [apiBaseUrl, jobs, sessionToken]);

  const activeItems = items.filter((item) => item.isActive);
  // Issue-to-job posts plain material cost, so only active PARTS are eligible (the backend
  // enforces this); equipment moves through the equipment bridge. Adjust/transfer keep all
  // active stock items.
  const activePartItems = activeItems.filter((item) => item.kind === 'part');
  const activeLocations = locations.filter((location) => location.isActive);
  // Only one form is open at a time; lock the other triggers so an in-progress draft can't be
  // silently replaced (mirrors the invoice-corrections single-editor guard).
  const formOpen = activeForm !== null;

  function closeForm() {
    setActiveForm(null);
  }

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
      await runSubmit(activeForm);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setIsSaving(false);
    }
  }

  async function runSubmit(form: ActiveForm) {
    if (form.kind === 'item') {
      const body = {
        sku: emptyToUndefined(form.draft.sku),
        name: form.draft.name.trim(),
        kind: form.draft.kind,
        unitOfMeasure: emptyToUndefined(form.draft.unitOfMeasure),
        defaultUnitCost: parseOptionalNumber(form.draft.defaultUnitCost),
        description: emptyToUndefined(form.draft.description)
      };
      if (form.editingId) {
        await updateOfficeInventoryItem({
          apiBaseUrl,
          sessionToken,
          itemId: form.editingId,
          body: { ...body, isActive: form.draft.isActive }
        });
        await afterWrite('Item updated.');
      } else {
        await createOfficeInventoryItem({ apiBaseUrl, sessionToken, body });
        await afterWrite('Item created.');
      }
      return;
    }
    if (form.kind === 'location') {
      const body = {
        name: form.draft.name.trim(),
        kind: form.draft.kind,
        assignedEmployeeId: emptyToUndefined(form.draft.assignedEmployeeId)
      };
      if (form.editingId) {
        await updateOfficeInventoryLocation({
          apiBaseUrl,
          sessionToken,
          locationId: form.editingId,
          body: { ...body, isActive: form.draft.isActive }
        });
        await afterWrite('Location updated.');
      } else {
        await createOfficeInventoryLocation({ apiBaseUrl, sessionToken, body });
        await afterWrite('Location created.');
      }
      return;
    }
    if (form.kind === 'adjust') {
      await createOfficeInventoryAdjustment({
        apiBaseUrl,
        sessionToken,
        body: {
          itemId: form.itemId,
          locationId: form.locationId,
          quantityDelta: requireNumber(form.quantityDelta, 'Quantity change'),
          unitCost: parseOptionalNumber(form.unitCost),
          note: emptyToUndefined(form.note)
        }
      });
      await afterWrite('Adjustment recorded.');
      return;
    }
    if (form.kind === 'transfer') {
      await createOfficeInventoryTransfer({
        apiBaseUrl,
        sessionToken,
        body: {
          itemId: form.itemId,
          fromLocationId: form.fromLocationId,
          toLocationId: form.toLocationId,
          quantity: requireNumber(form.quantity, 'Quantity'),
          note: emptyToUndefined(form.note)
        }
      });
      await afterWrite('Transfer recorded.');
      return;
    }
    await issueOfficeInventoryToJob({
      apiBaseUrl,
      sessionToken,
      body: {
        itemId: form.itemId,
        locationId: form.locationId,
        jobId: form.jobId,
        quantity: requireNumber(form.quantity, 'Quantity'),
        note: emptyToUndefined(form.note)
      }
    });
    await afterWrite('Issued to job.');
  }

  const firstItemId = activeItems[0]?.id ?? '';
  const firstPartItemId = activePartItems[0]?.id ?? '';
  const firstLocationId = activeLocations[0]?.id ?? '';

  return (
    <section style={styles.workspacePanel} aria-label="Inventory">
      <div style={styles.row}>
        <h1 style={styles.heading}>Inventory</h1>
        <div style={styles.inlineActionBar}>
          {canEdit ? (
            <>
              <button
                type="button"
                style={styles.button}
                disabled={
                  isSaving || formOpen || activeItems.length === 0 || activeLocations.length === 0
                }
                onClick={() =>
                  setActiveForm({
                    kind: 'adjust',
                    itemId: firstItemId,
                    locationId: firstLocationId,
                    quantityDelta: '',
                    unitCost: '',
                    note: ''
                  })
                }
              >
                Adjust stock
              </button>
              <button
                type="button"
                style={styles.button}
                disabled={
                  isSaving || formOpen || activeItems.length === 0 || activeLocations.length < 2
                }
                onClick={() =>
                  setActiveForm({
                    kind: 'transfer',
                    itemId: firstItemId,
                    fromLocationId: firstLocationId,
                    toLocationId: activeLocations[1]?.id ?? '',
                    quantity: '',
                    note: ''
                  })
                }
              >
                Transfer
              </button>
              <button
                type="button"
                style={styles.button}
                disabled={
                  isSaving ||
                  formOpen ||
                  activePartItems.length === 0 ||
                  activeLocations.length === 0
                }
                onClick={() => {
                  void ensureJobs();
                  setActiveForm({
                    kind: 'issue',
                    itemId: firstPartItemId,
                    locationId: firstLocationId,
                    jobId: '',
                    quantity: '',
                    note: ''
                  });
                }}
              >
                Issue to job
              </button>
            </>
          ) : null}
          {canCreate ? (
            <>
              <button
                type="button"
                style={styles.button}
                disabled={isSaving || formOpen}
                onClick={() =>
                  setActiveForm({ kind: 'item', editingId: null, draft: emptyItemDraft })
                }
              >
                Add item
              </button>
              <button
                type="button"
                style={styles.button}
                disabled={isSaving || formOpen}
                onClick={() =>
                  setActiveForm({ kind: 'location', editingId: null, draft: emptyLocationDraft })
                }
              >
                Add location
              </button>
            </>
          ) : null}
          <button
            type="button"
            style={styles.button}
            disabled={isLoading}
            onClick={() => void load()}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      {activeForm ? (
        <InventoryForm
          form={activeForm}
          items={activeForm.kind === 'issue' ? activePartItems : activeItems}
          locations={activeLocations}
          jobs={jobs}
          isSaving={isSaving}
          onChange={setActiveForm}
          onCancel={closeForm}
          onSubmit={() => void submitForm()}
        />
      ) : null}

      {hasLoaded ? (
        <>
          <InventoryPanel title="On hand" count={onHand.length} emptyText="No stock on hand yet.">
            <Table head={['Item', 'Kind', 'Location', 'Quantity', 'Avg unit cost', 'Total value']}>
              {onHand.map((row) => (
                <tr key={`${row.itemId}:${row.locationId}`}>
                  <td style={styles.tableCell}>{row.itemName}</td>
                  <td style={styles.tableCell}>{itemKindLabels[row.itemKind]}</td>
                  <td style={styles.tableCell}>{row.locationName}</td>
                  <td style={styles.tableCell}>{formatQuantity(row.quantity)}</td>
                  <td style={styles.tableCell}>{formatCurrency(row.averageUnitCost)}</td>
                  <td style={styles.tableCell}>{formatCurrency(row.totalValue)}</td>
                </tr>
              ))}
            </Table>
          </InventoryPanel>

          <InventoryPanel title="Items" count={items.length} emptyText="No catalog items yet.">
            <Table head={['Name', 'SKU', 'Kind', 'Unit', 'Default cost', 'Status', '']}>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={styles.tableCell}>{item.name}</td>
                  <td style={styles.tableCell}>{item.sku ?? '—'}</td>
                  <td style={styles.tableCell}>{itemKindLabels[item.kind]}</td>
                  <td style={styles.tableCell}>{item.unitOfMeasure ?? '—'}</td>
                  <td style={styles.tableCell}>
                    {item.defaultUnitCost === undefined
                      ? '—'
                      : formatCurrency(item.defaultUnitCost)}
                  </td>
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
                            kind: 'item',
                            editingId: item.id,
                            draft: {
                              sku: item.sku ?? '',
                              name: item.name,
                              kind: item.kind,
                              unitOfMeasure: item.unitOfMeasure ?? '',
                              defaultUnitCost:
                                item.defaultUnitCost === undefined
                                  ? ''
                                  : String(item.defaultUnitCost),
                              description: item.description ?? '',
                              isActive: item.isActive
                            }
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
          </InventoryPanel>

          <InventoryPanel
            title="Locations"
            count={locations.length}
            emptyText="No stock locations yet."
          >
            <Table head={['Name', 'Kind', 'Assigned to', 'Status', '']}>
              {locations.map((location) => (
                <tr key={location.id}>
                  <td style={styles.tableCell}>{location.name}</td>
                  <td style={styles.tableCell}>{locationKindLabels[location.kind]}</td>
                  <td style={styles.tableCell}>{location.assignedEmployeeName ?? '—'}</td>
                  <td style={styles.tableCell}>
                    <span style={location.isActive ? styles.badge : styles.dangerBadge}>
                      {location.isActive ? 'Active' : 'Inactive'}
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
                            kind: 'location',
                            editingId: location.id,
                            draft: {
                              name: location.name,
                              kind: location.kind,
                              assignedEmployeeId: location.assignedEmployeeId ?? '',
                              isActive: location.isActive
                            }
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
          </InventoryPanel>

          <InventoryPanel
            title="Recent movements"
            count={movements.length}
            emptyText="No movements recorded yet."
          >
            <Table
              head={[
                'When',
                'Item',
                'Activity',
                'Qty',
                'Unit cost',
                'Location',
                'Job',
                'By',
                'Note'
              ]}
            >
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td style={styles.tableCell}>{movement.occurredAt.slice(0, 10)}</td>
                  <td style={styles.tableCell}>{movement.itemName}</td>
                  <td style={styles.tableCell}>{movementKindLabels[movement.kind]}</td>
                  <td style={styles.tableCell}>{formatQuantity(movement.quantity)}</td>
                  <td style={styles.tableCell}>{formatCurrency(movement.unitCost)}</td>
                  <td style={styles.tableCell}>{movement.locationName ?? '—'}</td>
                  <td style={styles.tableCell}>
                    {movement.jobId ? (
                      <button
                        type="button"
                        style={styles.tableLinkButton}
                        onClick={() => onOpenJob(movement.jobId as string)}
                      >
                        View job
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={styles.tableCell}>{movement.actorName}</td>
                  <td style={styles.tableCell}>{movement.note ?? '—'}</td>
                </tr>
              ))}
            </Table>
          </InventoryPanel>
        </>
      ) : isLoading ? (
        <p style={styles.muted}>Loading inventory…</p>
      ) : null}
    </section>
  );
}

function InventoryPanel({
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

function requireNumber(value: string, label: string): number {
  const parsed = Number(value.trim());
  if (!value.trim() || !Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
}
