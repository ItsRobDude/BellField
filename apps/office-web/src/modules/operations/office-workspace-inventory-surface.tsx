'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  getOfficeInventoryMovements,
  getOfficeInventoryOnHand,
  type InventoryItem,
  type InventoryItemKind,
  type InventoryLocation,
  type InventoryLocationKind,
  type InventoryMovement,
  type InventoryMovementKind,
  type InventoryOnHandRow
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';

export type OfficeInventorySurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
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

// Read-only inventory overview: derived on-hand, the catalog, stock locations, and the
// movement ledger. Stacked panels (no in-surface tabs), all styling from
// officeWorkspaceStyles. Write actions (adjust/transfer/issue, item/location CRUD) are a
// later slice; this surface establishes the read shell.
export function OfficeInventorySurface({
  apiBaseUrl,
  sessionToken,
  onOpenJob
}: OfficeInventorySurfaceProps) {
  const [onHand, setOnHand] = useState<InventoryOnHandRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <section style={styles.workspacePanel} aria-label="Inventory">
      <div style={styles.row}>
        <h1 style={styles.heading}>Inventory</h1>
        <button
          type="button"
          style={styles.button}
          disabled={isLoading}
          onClick={() => void load()}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

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
            <Table head={['Name', 'SKU', 'Kind', 'Unit', 'Default cost', 'Status']}>
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
                </tr>
              ))}
            </Table>
          </InventoryPanel>

          <InventoryPanel
            title="Locations"
            count={locations.length}
            emptyText="No stock locations yet."
          >
            <Table head={['Name', 'Kind', 'Assigned to', 'Status']}>
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
          {head.map((label) => (
            <th key={label} style={styles.tableHeadCell}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
