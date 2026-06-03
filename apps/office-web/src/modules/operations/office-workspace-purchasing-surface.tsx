'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createOfficePurchaseOrder,
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  getOfficeJobsWorkspace,
  getOfficePurchaseOrder,
  listOfficePurchaseOrders,
  orderOfficePurchaseOrder,
  receiveOfficePurchaseOrder,
  type CreatePurchaseOrderRequest,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
  type ReceivePurchaseOrderRequest
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';
import {
  CreatePurchaseOrderForm,
  ReceivePurchaseOrderForm,
  lineKindLabels,
  type CreateSources
} from './office-workspace-purchasing-forms';

export type OfficePurchasingSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  onOpenJob: (jobId: string) => void;
};

const statusLabels: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  received: 'Received',
  closed: 'Closed'
};

function formatQuantity(value: number): string {
  return Number(value.toFixed(4)).toString();
}

// Purchasing surface: PO list + detail (read), creating a draft PO, and marking a draft
// ordered. Receiving is a later slice. All styling reuses officeWorkspaceStyles.
export function OfficePurchasingSurface({
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit,
  onOpenJob
}: OfficePurchasingSurfaceProps) {
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [sources, setSources] = useState<CreateSources | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  // Sequence guard so a slow detail fetch can't overwrite a newer selection.
  const openRequestRef = useRef(0);

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
      const requestId = openRequestRef.current + 1;
      openRequestRef.current = requestId;
      setSelectedId(purchaseOrderId);
      setSelectedOrder(null);
      setIsReceiving(false);
      setIsDetailLoading(true);
      setErrorMessage(null);
      try {
        const result = await getOfficePurchaseOrder({ apiBaseUrl, sessionToken, purchaseOrderId });
        if (openRequestRef.current !== requestId) {
          return; // a newer selection superseded this fetch
        }
        setSelectedOrder(result.purchaseOrder);
      } catch (error) {
        if (openRequestRef.current !== requestId) {
          return;
        }
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load the purchase order.'
        );
      } finally {
        if (openRequestRef.current === requestId) {
          setIsDetailLoading(false);
        }
      }
    },
    [apiBaseUrl, sessionToken]
  );

  async function startCreate() {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsCreating(true);
    if (!sources) {
      try {
        const [inventoryLocations, workspace, items] = await Promise.all([
          getOfficeInventoryLocations({ apiBaseUrl, sessionToken }),
          getOfficeJobsWorkspace({ apiBaseUrl, sessionToken }),
          getOfficeInventoryItems({ apiBaseUrl, sessionToken })
        ]);
        setSources({
          inventoryLocations: inventoryLocations.locations.filter((location) => location.isActive),
          customerLocations: workspace.locations,
          jobs: workspace.jobs,
          items: items.items.filter((item) => item.isActive)
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load PO options.');
      }
    }
  }

  async function submitCreate(body: CreatePurchaseOrderRequest) {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await createOfficePurchaseOrder({ apiBaseUrl, sessionToken, body });
      setIsCreating(false);
      setNoticeMessage(
        `Draft purchase order created${result.purchaseOrder.poNumber ? ` (${result.purchaseOrder.poNumber})` : ''}.`
      );
      await load();
      await openOrder(result.purchaseOrder.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to create the purchase order.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function markOrdered(purchaseOrderId: string) {
    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const result = await orderOfficePurchaseOrder({ apiBaseUrl, sessionToken, purchaseOrderId });
      setSelectedOrder(result.purchaseOrder);
      setNoticeMessage('Purchase order marked as ordered.');
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to order the purchase order.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function submitReceive(purchaseOrderId: string, body: ReceivePurchaseOrderRequest) {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await receiveOfficePurchaseOrder({
        apiBaseUrl,
        sessionToken,
        purchaseOrderId,
        body
      });
      setSelectedOrder(result.purchaseOrder);
      setIsReceiving(false);
      setNoticeMessage('Purchase order received.');
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to receive the purchase order.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isCreating) {
    return (
      <section style={styles.workspacePanel} aria-label="Purchasing">
        <div style={styles.row}>
          <h1 style={styles.heading}>New purchase order</h1>
          <button
            type="button"
            style={styles.button}
            disabled={isSaving}
            onClick={() => setIsCreating(false)}
          >
            Back
          </button>
        </div>
        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
        {sources ? (
          <CreatePurchaseOrderForm
            sources={sources}
            isSaving={isSaving}
            onCancel={() => setIsCreating(false)}
            onSubmit={(body) => void submitCreate(body)}
          />
        ) : (
          <p style={styles.muted}>Loading purchase-order options…</p>
        )}
      </section>
    );
  }

  return (
    <section style={styles.workspacePanel} aria-label="Purchasing">
      <div style={styles.row}>
        <h1 style={styles.heading}>Purchasing</h1>
        <div style={styles.inlineActionBar}>
          {canCreate ? (
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isLoading}
              onClick={() => void startCreate()}
            >
              New purchase order
            </button>
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

          {selectedId && isReceiving && selectedOrder ? (
            <ReceivePurchaseOrderForm
              order={selectedOrder}
              isSaving={isSaving}
              onCancel={() => setIsReceiving(false)}
              onSubmit={(body) => void submitReceive(selectedOrder.id, body)}
            />
          ) : selectedId ? (
            <PurchaseOrderDetail
              order={selectedOrder}
              isLoading={isDetailLoading}
              canEdit={canEdit}
              isSaving={isSaving}
              onOpenJob={onOpenJob}
              onMarkOrdered={() => void markOrdered(selectedId)}
              onReceive={() => setIsReceiving(true)}
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
  canEdit,
  isSaving,
  onOpenJob,
  onMarkOrdered,
  onReceive
}: {
  order: PurchaseOrder | null;
  isLoading: boolean;
  canEdit: boolean;
  isSaving: boolean;
  onOpenJob: (jobId: string) => void;
  onMarkOrdered: () => void;
  onReceive: () => void;
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
        <div style={styles.inlineActionBar}>
          <span style={styles.badge}>{statusLabels[order.status]}</span>
          {canEdit && order.status === 'draft' ? (
            <button type="button" style={styles.button} disabled={isSaving} onClick={onMarkOrdered}>
              {isSaving ? 'Working…' : 'Mark ordered'}
            </button>
          ) : null}
          {canEdit && order.status === 'ordered' ? (
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isSaving}
              onClick={onReceive}
            >
              Receive
            </button>
          ) : null}
        </div>
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
