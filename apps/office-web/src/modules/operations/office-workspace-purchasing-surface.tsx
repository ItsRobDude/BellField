'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  createOfficePurchaseOrder,
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  getOfficeJobsWorkspace,
  getOfficePurchaseOrder,
  listOfficePurchaseOrders,
  orderOfficePurchaseOrder,
  receiveOfficePurchaseOrder,
  type CreatePurchaseOrderLineRequest,
  type CreatePurchaseOrderRequest,
  type InventoryItem,
  type InventoryLocation,
  type JobSummary,
  type LocationSummary,
  type PurchaseOrder,
  type PurchaseOrderLineKind,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
  type ReceivePurchaseOrderLineInput,
  type ReceivePurchaseOrderRequest
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';

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

const lineKindLabels: Record<PurchaseOrderLineKind, string> = {
  part: 'Part',
  equipment: 'Equipment'
};

type CreateSources = {
  inventoryLocations: InventoryLocation[];
  customerLocations: LocationSummary[];
  jobs: JobSummary[];
  items: InventoryItem[];
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
        const result = await getOfficePurchaseOrder({ apiBaseUrl, sessionToken, purchaseOrderId });
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

type LineDraft = {
  kind: PurchaseOrderLineKind;
  itemId: string;
  description: string;
  quantity: string;
  expectedUnitCost: string;
  equipmentType: string;
  equipmentBrand: string;
  equipmentModel: string;
  equipmentSerial: string;
};

function emptyLine(): LineDraft {
  return {
    kind: 'part',
    itemId: '',
    description: '',
    quantity: '1',
    expectedUnitCost: '0',
    equipmentType: '',
    equipmentBrand: '',
    equipmentModel: '',
    equipmentSerial: ''
  };
}

function CreatePurchaseOrderForm({
  sources,
  isSaving,
  onCancel,
  onSubmit
}: {
  sources: CreateSources;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (body: CreatePurchaseOrderRequest) => void;
}) {
  const [poNumber, setPoNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [destinationKind, setDestinationKind] = useState<'inventory' | 'customer'>('inventory');
  const [inventoryLocationId, setInventoryLocationId] = useState(
    sources.inventoryLocations[0]?.id ?? ''
  );
  const [customerLocationId, setCustomerLocationId] = useState(
    sources.customerLocations[0]?.id ?? ''
  );
  const [jobId, setJobId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  const destinationReady =
    destinationKind === 'inventory' ? Boolean(inventoryLocationId) : Boolean(customerLocationId);
  const linesReady =
    lines.length > 0 &&
    lines.every((line) => {
      if (!line.description.trim()) {
        return false;
      }
      if (!Number.isFinite(Number(line.expectedUnitCost))) {
        return false;
      }
      if (line.kind === 'part') {
        return Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0;
      }
      return Boolean(
        line.equipmentType.trim() && line.equipmentBrand.trim() && line.equipmentModel.trim()
      );
    });
  const canSubmit = Boolean(vendorName.trim()) && destinationReady && linesReady;

  function buildBody(): CreatePurchaseOrderRequest {
    const requestLines: CreatePurchaseOrderLineRequest[] = lines.map((line) => ({
      itemId: line.itemId || undefined,
      kind: line.kind,
      description: line.description.trim(),
      quantity: line.kind === 'equipment' ? 1 : Number(line.quantity),
      expectedUnitCost: Number(line.expectedUnitCost),
      equipmentType: line.kind === 'equipment' ? line.equipmentType.trim() || undefined : undefined,
      equipmentBrand:
        line.kind === 'equipment' ? line.equipmentBrand.trim() || undefined : undefined,
      equipmentModel:
        line.kind === 'equipment' ? line.equipmentModel.trim() || undefined : undefined,
      equipmentSerial:
        line.kind === 'equipment' ? line.equipmentSerial.trim() || undefined : undefined
    }));
    return {
      poNumber: poNumber.trim() || undefined,
      vendorName: vendorName.trim(),
      destinationInventoryLocationId:
        destinationKind === 'inventory' ? inventoryLocationId : undefined,
      destinationCustomerLocationId:
        destinationKind === 'customer' ? customerLocationId : undefined,
      jobId: jobId || undefined,
      notes: notes.trim() || undefined,
      lines: requestLines
    };
  }

  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(buildBody());
      }}
    >
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          Vendor
          <input
            style={styles.input}
            value={vendorName}
            onChange={(event) => setVendorName(event.target.value)}
          />
        </label>
        <label style={styles.fieldLabel}>
          PO number (optional)
          <input
            style={styles.input}
            value={poNumber}
            onChange={(event) => setPoNumber(event.target.value)}
          />
        </label>
        <label style={styles.fieldLabel}>
          Destination
          <select
            style={styles.input}
            value={destinationKind}
            onChange={(event) => setDestinationKind(event.target.value as 'inventory' | 'customer')}
          >
            <option value="inventory">Inventory location</option>
            <option value="customer">Customer location</option>
          </select>
        </label>
        {destinationKind === 'inventory' ? (
          <label style={styles.fieldLabel}>
            Inventory location
            <select
              style={styles.input}
              value={inventoryLocationId}
              onChange={(event) => setInventoryLocationId(event.target.value)}
            >
              {sources.inventoryLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label style={styles.fieldLabel}>
            Customer location
            <select
              style={styles.input}
              value={customerLocationId}
              onChange={(event) => setCustomerLocationId(event.target.value)}
            >
              {sources.customerLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} · {location.customerName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={styles.fieldLabel}>
          Job (optional)
          <select
            style={styles.input}
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            <option value="">No job</option>
            {sources.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                #{job.jobNumber} · {job.summary}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.fieldLabel}>
          Notes (optional)
          <input
            style={styles.input}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>

      <div style={styles.row}>
        <h3 style={styles.sectionHeading}>Lines</h3>
        <button
          type="button"
          style={styles.button}
          disabled={isSaving}
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          Add line
        </button>
      </div>

      {lines.map((line, index) => (
        <div key={index} style={styles.subpanel}>
          <div style={styles.formGridCompact}>
            <label style={styles.fieldLabel}>
              Kind
              <select
                style={styles.input}
                value={line.kind}
                onChange={(event) =>
                  updateLine(index, {
                    kind: event.target.value as PurchaseOrderLineKind,
                    quantity: event.target.value === 'equipment' ? '1' : line.quantity
                  })
                }
              >
                <option value="part">Part</option>
                <option value="equipment">Equipment</option>
              </select>
            </label>
            <label style={styles.fieldLabel}>
              Catalog item (optional)
              <select
                style={styles.input}
                value={line.itemId}
                onChange={(event) => updateLine(index, { itemId: event.target.value })}
              >
                <option value="">None</option>
                {sources.items
                  .filter((item) => item.kind === line.kind)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label style={styles.fieldLabel}>
              Description
              <input
                style={styles.input}
                value={line.description}
                onChange={(event) => updateLine(index, { description: event.target.value })}
              />
            </label>
            {line.kind === 'part' ? (
              <label style={styles.fieldLabel}>
                Quantity
                <input
                  style={styles.input}
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
              </label>
            ) : null}
            <label style={styles.fieldLabel}>
              Expected unit cost
              <input
                style={styles.input}
                value={line.expectedUnitCost}
                onChange={(event) => updateLine(index, { expectedUnitCost: event.target.value })}
              />
            </label>
            {line.kind === 'equipment' ? (
              <>
                <label style={styles.fieldLabel}>
                  Equipment type
                  <input
                    style={styles.input}
                    value={line.equipmentType}
                    onChange={(event) => updateLine(index, { equipmentType: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  Brand
                  <input
                    style={styles.input}
                    value={line.equipmentBrand}
                    onChange={(event) => updateLine(index, { equipmentBrand: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  Model
                  <input
                    style={styles.input}
                    value={line.equipmentModel}
                    onChange={(event) => updateLine(index, { equipmentModel: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  Serial (optional)
                  <input
                    style={styles.input}
                    value={line.equipmentSerial}
                    onChange={(event) => updateLine(index, { equipmentSerial: event.target.value })}
                  />
                </label>
              </>
            ) : null}
          </div>
          {lines.length > 1 ? (
            <button
              type="button"
              style={styles.tableLinkButton}
              disabled={isSaving}
              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
            >
              Remove line
            </button>
          ) : null}
        </div>
      ))}

      <div style={styles.inlineActionBar}>
        <button type="submit" style={styles.primaryButton} disabled={isSaving || !canSubmit}>
          {isSaving ? 'Creating…' : 'Create draft PO'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type ReceiveLineDraft = { quantity: string; unitCost: string; serialNumber: string };

function ReceivePurchaseOrderForm({
  order,
  isSaving,
  onCancel,
  onSubmit
}: {
  order: PurchaseOrder;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (body: ReceivePurchaseOrderRequest) => void;
}) {
  const [drafts, setDrafts] = useState<ReceiveLineDraft[]>(() =>
    order.lines.map((line) => ({
      quantity: String(line.quantity),
      unitCost: String(line.expectedUnitCost),
      serialNumber: line.equipmentSerial ?? ''
    }))
  );
  const [note, setNote] = useState('');
  const [confirmMissingSerial, setConfirmMissingSerial] = useState(false);

  function updateDraft(index: number, patch: Partial<ReceiveLineDraft>) {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft))
    );
  }

  const hasEquipment = order.lines.some((line) => line.kind === 'equipment');
  // An equipment line with no serial on the PO and none entered here needs the confirm toggle.
  const hasMissingSerial = order.lines.some(
    (line, index) =>
      line.kind === 'equipment' &&
      !line.equipmentSerial?.trim() &&
      !drafts[index]?.serialNumber.trim()
  );

  function buildBody(): ReceivePurchaseOrderRequest {
    const lines: ReceivePurchaseOrderLineInput[] = order.lines.map((line, index) => {
      const draft = drafts[index];
      const input: ReceivePurchaseOrderLineInput = { purchaseOrderLineId: line.id };
      if (line.kind === 'part' && draft.quantity.trim()) {
        input.quantity = Number(draft.quantity);
      }
      if (draft.unitCost.trim()) {
        input.unitCost = Number(draft.unitCost);
      }
      if (line.kind === 'equipment' && draft.serialNumber.trim()) {
        input.serialNumber = draft.serialNumber.trim();
      }
      return input;
    });
    return {
      note: note.trim() || undefined,
      lines,
      confirmMissingSerial: confirmMissingSerial || undefined
    };
  }

  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(buildBody());
      }}
    >
      <h2 style={styles.heading}>
        Receive {order.poNumber ? `PO ${order.poNumber}` : 'purchase order'}
      </h2>
      <p style={styles.tinyMuted}>
        Enter the actual received quantity and cost per line. Equipment is received one unit at a
        time and creates an asset record.
      </p>

      {order.lines.map((line, index) => (
        <div key={line.id} style={styles.subpanel}>
          <div style={styles.row}>
            <strong>
              {line.position + 1}. {line.description}
            </strong>
            <span style={styles.badge}>{lineKindLabels[line.kind]}</span>
          </div>
          <div style={styles.formGridCompact}>
            {line.kind === 'part' ? (
              <label style={styles.fieldLabel}>
                Received quantity
                <input
                  style={styles.input}
                  value={drafts[index].quantity}
                  onChange={(event) => updateDraft(index, { quantity: event.target.value })}
                />
              </label>
            ) : null}
            <label style={styles.fieldLabel}>
              Actual unit cost
              <input
                style={styles.input}
                value={drafts[index].unitCost}
                onChange={(event) => updateDraft(index, { unitCost: event.target.value })}
              />
            </label>
            {line.kind === 'equipment' ? (
              <label style={styles.fieldLabel}>
                Serial number
                <input
                  style={styles.input}
                  value={drafts[index].serialNumber}
                  onChange={(event) => updateDraft(index, { serialNumber: event.target.value })}
                />
              </label>
            ) : null}
          </div>
        </div>
      ))}

      <label style={styles.fieldLabel}>
        Note (optional)
        <input
          style={styles.input}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {hasEquipment ? (
        <label style={styles.inlineLabel}>
          <input
            type="checkbox"
            checked={confirmMissingSerial}
            onChange={(event) => setConfirmMissingSerial(event.target.checked)}
          />
          Receive equipment without a serial number
        </label>
      ) : null}

      {hasMissingSerial && !confirmMissingSerial ? (
        <p style={styles.tinyMuted}>
          An equipment line has no serial number. Enter one above, or check the box to receive
          without it.
        </p>
      ) : null}

      <div style={styles.inlineActionBar}>
        <button type="submit" style={styles.primaryButton} disabled={isSaving}>
          {isSaving ? 'Receiving…' : 'Receive purchase order'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
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
