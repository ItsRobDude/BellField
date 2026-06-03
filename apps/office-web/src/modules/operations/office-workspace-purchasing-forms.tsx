'use client';

import { useEffect, useState } from 'react';
import {
  type CreatePurchaseOrderLineRequest,
  type CreatePurchaseOrderRequest,
  type InventoryItem,
  type InventoryLocation,
  type JobSummary,
  type LocationSummary,
  type PurchaseOrder,
  type PurchaseOrderLineKind,
  type ReceivePurchaseOrderLineInput,
  type ReceivePurchaseOrderRequest
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

// Purchasing write forms (create + receive), split out of the surface so each file stays under the
// engineering-standards size budget. The surface owns the read views, data loading, and submit
// handlers; these components are pure prop-driven editors.

export const lineKindLabels: Record<PurchaseOrderLineKind, string> = {
  part: 'Part',
  equipment: 'Equipment'
};

export type CreateSources = {
  inventoryLocations: InventoryLocation[];
  customerLocations: LocationSummary[];
  jobs: JobSummary[];
  items: InventoryItem[];
};

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isNonNegativeNumber(value: string): boolean {
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
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

export function CreatePurchaseOrderForm({
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

  // Customer-destination jobs must belong to the chosen customer location (backend rule).
  const availableJobs =
    destinationKind === 'customer'
      ? sources.jobs.filter((job) => job.locationId === customerLocationId)
      : sources.jobs;

  useEffect(() => {
    if (jobId && !availableJobs.some((job) => job.id === jobId)) {
      setJobId('');
    }
  }, [availableJobs, jobId]);

  const destinationReady =
    destinationKind === 'inventory' ? Boolean(inventoryLocationId) : Boolean(customerLocationId);
  // A part going into stock, or to a job, posts an inventory movement and needs a catalog item;
  // equipment received to a job also needs one (its cost provenance). Mirrors the backend.
  const partPostsMovement =
    destinationKind === 'inventory' || (destinationKind === 'customer' && jobId !== '');
  const equipmentNeedsItem = destinationKind === 'customer' && jobId !== '';

  function lineNeedsItem(line: LineDraft): boolean {
    return line.kind === 'part' ? partPostsMovement : equipmentNeedsItem;
  }

  const linesReady =
    lines.length > 0 &&
    lines.every((line) => {
      if (!line.description.trim() || !isNonNegativeNumber(line.expectedUnitCost)) {
        return false;
      }
      if (lineNeedsItem(line) && !line.itemId) {
        return false;
      }
      if (line.kind === 'part') {
        return isPositiveNumber(line.quantity);
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
            {availableJobs.map((job) => (
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
              {lineNeedsItem(line) ? 'Catalog item (required)' : 'Catalog item (optional)'}
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

export function ReceivePurchaseOrderForm({
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
  // Block obviously-bad numbers inline rather than round-tripping to a backend 400.
  const numbersValid = order.lines.every((line, index) => {
    const draft = drafts[index];
    if (line.kind === 'part' && !isPositiveNumber(draft.quantity)) {
      return false;
    }
    return isNonNegativeNumber(draft.unitCost);
  });
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
        <button
          type="submit"
          style={styles.primaryButton}
          disabled={isSaving || !numbersValid || (hasMissingSerial && !confirmMissingSerial)}
        >
          {isSaving ? 'Receiving…' : 'Receive purchase order'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
