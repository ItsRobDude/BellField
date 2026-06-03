'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  getOfficePurchaseOrder,
  listOfficePurchaseOrders,
  type PurchaseOrder,
  type PurchaseOrderLineKind,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';

export type OfficePurchasingSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  onOpenJob: (jobId: string) => void;
};

const statusLabels: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  received: 'Received',
  closed: 'Closed'
};

const lineKindLabels: Record<PurchaseOrderLineKind, string> = {
  part: 'Part',
  equipment: 'Equipment'
};

function formatQuantity(value: number): string {
  return Number(value.toFixed(4)).toString();
}

// Read-only purchasing overview: the PO list and a selected PO's detail (header + lines).
// Create / order / receive actions are later slices; this surface establishes the read shell.
// All styling reuses officeWorkspaceStyles.
export function OfficePurchasingSurface({
  apiBaseUrl,
  sessionToken,
  onOpenJob
}: OfficePurchasingSurfaceProps) {
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await listOfficePurchaseOrders({ apiBaseUrl, sessionToken });
      setOrders(result.purchaseOrders);
      setHasLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load purchase orders.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openOrder = useCallback(
    async (purchaseOrderId: string) => {
      setSelectedId(purchaseOrderId);
      setSelectedOrder(null);
      setIsDetailLoading(true);
      setErrorMessage(null);
      try {
        const result = await getOfficePurchaseOrder({
          apiBaseUrl,
          sessionToken,
          purchaseOrderId
        });
        setSelectedOrder(result.purchaseOrder);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load the purchase order.'
        );
      } finally {
        setIsDetailLoading(false);
      }
    },
    [apiBaseUrl, sessionToken]
  );

  return (
    <section style={styles.workspacePanel} aria-label="Purchasing">
      <div style={styles.row}>
        <h1 style={styles.heading}>Purchasing</h1>
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
          <div style={styles.panel}>
            <div style={styles.row}>
              <h2 style={styles.heading}>Purchase orders</h2>
              <span style={styles.badge}>{orders.length}</span>
            </div>
            {orders.length === 0 ? (
              <p style={styles.muted}>No purchase orders yet.</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {[
                        'PO',
                        'Vendor',
                        'Status',
                        'Destination',
                        'Job',
                        'Lines',
                        'Expected total'
                      ].map((label) => (
                        <th key={label} style={styles.tableHeadCell}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td style={styles.tableCell}>
                          <button
                            type="button"
                            style={styles.tableLinkButton}
                            onClick={() => void openOrder(order.id)}
                          >
                            {order.poNumber ?? order.id.slice(0, 8)}
                          </button>
                        </td>
                        <td style={styles.tableCell}>{order.vendorName}</td>
                        <td style={styles.tableCell}>
                          <span style={styles.badge}>{statusLabels[order.status]}</span>
                        </td>
                        <td style={styles.tableCell}>{order.destinationName}</td>
                        <td style={styles.tableCell}>
                          {order.jobNumber ? `#${order.jobNumber}` : '—'}
                        </td>
                        <td style={styles.tableCell}>{order.lineCount}</td>
                        <td style={styles.tableCell}>{formatCurrency(order.expectedTotalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedId ? (
            <PurchaseOrderDetail
              order={selectedOrder}
              isLoading={isDetailLoading}
              onOpenJob={onOpenJob}
            />
          ) : null}
        </>
      ) : isLoading ? (
        <p style={styles.muted}>Loading purchase orders…</p>
      ) : null}
    </section>
  );
}

function PurchaseOrderDetail({
  order,
  isLoading,
  onOpenJob
}: {
  order: PurchaseOrder | null;
  isLoading: boolean;
  onOpenJob: (jobId: string) => void;
}) {
  if (isLoading && !order) {
    return (
      <div style={styles.panel}>
        <p style={styles.muted}>Loading purchase order…</p>
      </div>
    );
  }
  if (!order) {
    return null;
  }

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h2 style={styles.heading}>
          {order.poNumber ? `PO ${order.poNumber}` : 'Purchase order'} · {order.vendorName}
        </h2>
        <span style={styles.badge}>{statusLabels[order.status]}</span>
      </div>

      <div style={styles.detailGrid}>
        <DetailField label="Destination" value={order.destinationName} />
        <DetailField
          label="Job"
          value={
            order.jobId ? (
              <button
                type="button"
                style={styles.tableLinkButton}
                onClick={() => onOpenJob(order.jobId as string)}
              >
                {order.jobNumber ? `#${order.jobNumber}` : 'View job'}
              </button>
            ) : (
              '—'
            )
          }
        />
        <DetailField label="Created by" value={order.createdByName} />
        {order.orderedByName ? (
          <DetailField
            label="Ordered"
            value={`${order.orderedByName}${order.orderedAt ? ` · ${order.orderedAt.slice(0, 10)}` : ''}`}
          />
        ) : null}
      </div>

      {order.notes ? <p style={styles.muted}>{order.notes}</p> : null}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['#', 'Kind', 'Description', 'Qty', 'Expected unit', 'Expected line'].map(
                (label) => (
                  <th key={label} style={styles.tableHeadCell}>
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td style={styles.tableCell}>{line.position + 1}</td>
                <td style={styles.tableCell}>{lineKindLabels[line.kind]}</td>
                <td style={styles.tableCell}>
                  {line.description}
                  {line.kind === 'equipment' &&
                  (line.equipmentType || line.equipmentBrand || line.equipmentModel) ? (
                    <p style={styles.tinyMuted}>
                      {[line.equipmentType, line.equipmentBrand, line.equipmentModel]
                        .filter(Boolean)
                        .join(' · ')}
                      {line.equipmentSerial ? ` · SN ${line.equipmentSerial}` : ''}
                    </p>
                  ) : null}
                </td>
                <td style={styles.tableCell}>{formatQuantity(line.quantity)}</td>
                <td style={styles.tableCell}>{formatCurrency(line.expectedUnitCost)}</td>
                <td style={styles.tableCell}>{formatCurrency(line.expectedLineCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.row}>
        <span style={styles.muted}>Expected total</span>
        <strong>{formatCurrency(order.expectedTotalCost)}</strong>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p style={styles.fieldText}>{label}</p>
      <div>{value}</div>
    </div>
  );
}
