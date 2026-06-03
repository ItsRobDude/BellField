'use client';

import {
  type InventoryItem,
  type InventoryItemKind,
  type InventoryLocation,
  type InventoryLocationKind,
  type JobSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

// Inventory write form (catalog item / location edits plus adjust / transfer / issue-to-job),
// split out of the surface so each file stays under the engineering-standards size budget. The
// surface owns the read panels, data loading, and submit handlers; this file holds the single
// active-form editor, its field sub-components, and the form drafts/guards they share.

// Final job phases: issue-to-job is blocked (reopen to revise). Mirrors the API's set.
const FINAL_JOB_STATUSES: readonly string[] = ['completed', 'closed', 'cancelled'];

export type ItemDraft = {
  sku: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure: string;
  defaultUnitCost: string;
  description: string;
  isActive: boolean;
};

export type LocationDraft = {
  name: string;
  kind: InventoryLocationKind;
  assignedEmployeeId: string;
  isActive: boolean;
};

export type ActiveForm =
  | { kind: 'item'; editingId: string | null; draft: ItemDraft }
  | { kind: 'location'; editingId: string | null; draft: LocationDraft }
  | {
      kind: 'adjust';
      itemId: string;
      locationId: string;
      quantityDelta: string;
      unitCost: string;
      note: string;
    }
  | {
      kind: 'transfer';
      itemId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: string;
      note: string;
    }
  | {
      kind: 'issue';
      itemId: string;
      locationId: string;
      jobId: string;
      quantity: string;
      note: string;
    };

export const emptyItemDraft: ItemDraft = {
  sku: '',
  name: '',
  kind: 'part',
  unitOfMeasure: '',
  defaultUnitCost: '',
  description: '',
  isActive: true
};

export const emptyLocationDraft: LocationDraft = {
  name: '',
  kind: 'warehouse',
  assignedEmployeeId: '',
  isActive: true
};

const formTitles: Record<ActiveForm['kind'], string> = {
  item: 'Catalog item',
  location: 'Stock location',
  adjust: 'Adjust stock',
  transfer: 'Transfer stock',
  issue: 'Issue stock to a job'
};

export function InventoryForm({
  form,
  items,
  locations,
  jobs,
  isSaving,
  onChange,
  onCancel,
  onSubmit
}: {
  form: ActiveForm;
  items: InventoryItem[];
  locations: InventoryLocation[];
  jobs: JobSummary[] | null;
  isSaving: boolean;
  onChange: (form: ActiveForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const title = formTitles[form.kind];
  // Issue-to-job is blocked on a final job (reopen to revise); disable Save and explain why.
  const selectedJobFinal =
    form.kind === 'issue' && form.jobId
      ? FINAL_JOB_STATUSES.includes(jobs?.find((job) => job.id === form.jobId)?.status ?? '')
      : false;
  const submittable = canSubmitForm(form) && !selectedJobFinal;
  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2 style={styles.heading}>{title}</h2>
      <div style={styles.formGridCompact}>
        {form.kind === 'item' ? (
          <>
            <TextField
              label="Name"
              value={form.draft.name}
              onChange={(name) => onChange({ ...form, draft: { ...form.draft, name } })}
            />
            <TextField
              label="SKU"
              value={form.draft.sku}
              onChange={(sku) => onChange({ ...form, draft: { ...form.draft, sku } })}
            />
            <SelectField
              label="Kind"
              value={form.draft.kind}
              options={[
                { value: 'part', label: 'Part' },
                { value: 'equipment', label: 'Equipment' }
              ]}
              onChange={(kind) =>
                onChange({ ...form, draft: { ...form.draft, kind: kind as InventoryItemKind } })
              }
            />
            <TextField
              label="Unit of measure"
              value={form.draft.unitOfMeasure}
              onChange={(unitOfMeasure) =>
                onChange({ ...form, draft: { ...form.draft, unitOfMeasure } })
              }
            />
            <TextField
              label="Default unit cost"
              value={form.draft.defaultUnitCost}
              onChange={(defaultUnitCost) =>
                onChange({ ...form, draft: { ...form.draft, defaultUnitCost } })
              }
            />
            <TextField
              label="Description"
              value={form.draft.description}
              onChange={(description) =>
                onChange({ ...form, draft: { ...form.draft, description } })
              }
            />
            {form.editingId ? (
              <CheckboxField
                label="Active"
                checked={form.draft.isActive}
                onChange={(isActive) => onChange({ ...form, draft: { ...form.draft, isActive } })}
              />
            ) : null}
          </>
        ) : null}

        {form.kind === 'location' ? (
          <>
            <TextField
              label="Name"
              value={form.draft.name}
              onChange={(name) => onChange({ ...form, draft: { ...form.draft, name } })}
            />
            <SelectField
              label="Kind"
              value={form.draft.kind}
              options={[
                { value: 'warehouse', label: 'Warehouse' },
                { value: 'truck', label: 'Truck / van' },
                { value: 'other', label: 'Other' }
              ]}
              onChange={(kind) =>
                onChange({
                  ...form,
                  draft: { ...form.draft, kind: kind as InventoryLocationKind }
                })
              }
            />
            <TextField
              label="Assigned employee id"
              value={form.draft.assignedEmployeeId}
              onChange={(assignedEmployeeId) =>
                onChange({ ...form, draft: { ...form.draft, assignedEmployeeId } })
              }
            />
            {form.editingId ? (
              <CheckboxField
                label="Active"
                checked={form.draft.isActive}
                onChange={(isActive) => onChange({ ...form, draft: { ...form.draft, isActive } })}
              />
            ) : null}
          </>
        ) : null}

        {form.kind === 'adjust' ? (
          <>
            <ItemSelect
              items={items}
              value={form.itemId}
              onChange={(itemId) => onChange({ ...form, itemId })}
            />
            <LocationSelect
              label="Location"
              locations={locations}
              value={form.locationId}
              onChange={(locationId) => onChange({ ...form, locationId })}
            />
            <TextField
              label="Quantity change (+/−)"
              value={form.quantityDelta}
              onChange={(quantityDelta) => onChange({ ...form, quantityDelta })}
            />
            <TextField
              label="Unit cost (gain onto empty)"
              value={form.unitCost}
              onChange={(unitCost) => onChange({ ...form, unitCost })}
            />
            <TextField
              label="Note"
              value={form.note}
              onChange={(note) => onChange({ ...form, note })}
            />
          </>
        ) : null}

        {form.kind === 'transfer' ? (
          <>
            <ItemSelect
              items={items}
              value={form.itemId}
              onChange={(itemId) => onChange({ ...form, itemId })}
            />
            <LocationSelect
              label="From"
              locations={locations}
              value={form.fromLocationId}
              onChange={(fromLocationId) => onChange({ ...form, fromLocationId })}
            />
            <LocationSelect
              label="To"
              locations={locations}
              value={form.toLocationId}
              onChange={(toLocationId) => onChange({ ...form, toLocationId })}
            />
            <TextField
              label="Quantity"
              value={form.quantity}
              onChange={(quantity) => onChange({ ...form, quantity })}
            />
            <TextField
              label="Note"
              value={form.note}
              onChange={(note) => onChange({ ...form, note })}
            />
          </>
        ) : null}

        {form.kind === 'issue' ? (
          <>
            <ItemSelect
              items={items}
              value={form.itemId}
              onChange={(itemId) => onChange({ ...form, itemId })}
            />
            <LocationSelect
              label="From location"
              locations={locations}
              value={form.locationId}
              onChange={(locationId) => onChange({ ...form, locationId })}
            />
            <label style={styles.fieldLabel}>
              Job
              <select
                style={styles.input}
                value={form.jobId}
                onChange={(event) => onChange({ ...form, jobId: event.target.value })}
              >
                <option value="">{jobs ? 'Select a job…' : 'Loading jobs…'}</option>
                {(jobs ?? []).map((job) => (
                  <option key={job.id} value={job.id}>
                    #{job.jobNumber} · {job.summary}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Quantity"
              value={form.quantity}
              onChange={(quantity) => onChange({ ...form, quantity })}
            />
            <TextField
              label="Note"
              value={form.note}
              onChange={(note) => onChange({ ...form, note })}
            />
          </>
        ) : null}
      </div>
      {selectedJobFinal ? (
        <p style={styles.tinyMuted}>That job is finalized. Reopen it before issuing stock to it.</p>
      ) : null}
      <div style={styles.inlineActionBar}>
        <button type="submit" style={styles.primaryButton} disabled={isSaving || !submittable}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ItemSelect({
  items,
  value,
  onChange
}: {
  items: InventoryItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      Item
      <select style={styles.input} value={value} onChange={(event) => onChange(event.target.value)}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function LocationSelect({
  label,
  locations,
  value,
  onChange
}: {
  label: string;
  locations: InventoryLocation[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <select style={styles.input} value={value} onChange={(event) => onChange(event.target.value)}>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <input
        style={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <select style={styles.input} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={styles.inlineLabel}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

// Client-side completeness guard so Save is disabled (rather than surfacing a backend DTO
// error) until the required selections/values are present. The backend still validates.
function canSubmitForm(form: ActiveForm): boolean {
  if (form.kind === 'item' || form.kind === 'location') {
    return form.draft.name.trim() !== '';
  }
  if (form.kind === 'adjust') {
    return Boolean(form.itemId && form.locationId && form.quantityDelta.trim());
  }
  if (form.kind === 'transfer') {
    return Boolean(
      form.itemId &&
        form.fromLocationId &&
        form.toLocationId &&
        form.fromLocationId !== form.toLocationId &&
        form.quantity.trim()
    );
  }
  return Boolean(form.itemId && form.locationId && form.jobId && form.quantity.trim());
}
