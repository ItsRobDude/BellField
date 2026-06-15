'use client';

import type { InvoiceLineItemSummary, InvoiceSummary } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  invoiceLineKindLabels,
  invoiceLineKindOptions,
  type InvoiceLineDraft
} from './job-invoice-types';

// Presentational helpers shared by the job invoice draft section and the
// adjustments/credits corrections section, so both render money the same way and
// reuse one line editor. All styling reuses officeWorkspaceStyles.

export const invoiceSourceLabels: Record<InvoiceLineItemSummary['sourceKind'], string> = {
  manual: 'Office',
  register: 'Register',
  estimate: 'Estimate'
};

// Payment actions are gated on the payments permission area, separate from invoice
// view/edit so office staff can have billing visibility without payment authority.
export type InvoicePaymentPermissions = {
  canView: boolean;
  canRecord: boolean;
  canVoid: boolean;
  canRefund: boolean;
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}

export function formatAddress(place: {
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}): string {
  const cityState = [place.city, place.state].filter((part) => part && part.trim()).join(', ');
  const tail = [cityState, place.postalCode?.trim()].filter(Boolean).join(' ');
  return [place.addressLine1?.trim(), tail].filter(Boolean).join(', ');
}

export function SummaryRow({
  label,
  value,
  emphasize
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div style={styles.row}>
      <span style={styles.tinyMuted}>{label}</span>
      <span style={{ fontWeight: emphasize ? 800 : 600 }}>{value}</span>
    </div>
  );
}

export function InvoiceTotals({ invoice }: { invoice: InvoiceSummary }) {
  const { totals } = invoice;
  return (
    <div style={styles.subpanel}>
      <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
      {totals.discount > 0 ? (
        <SummaryRow label="Discount" value={`−${formatCurrency(totals.discount)}`} />
      ) : null}
      <SummaryRow label="Tax" value={formatCurrency(totals.tax)} />
      <SummaryRow label="Total" value={formatCurrency(totals.total)} emphasize />
    </div>
  );
}

// The frozen customer/location/job context captured at posting. Shown read-only so the
// posted bill always renders as it was, regardless of later CRM edits.
export function PostedInvoiceSummary({
  posted
}: {
  posted: NonNullable<InvoiceSummary['posted']>;
}) {
  const billToAddress = formatAddress(posted.billTo);
  const serviceAddress = formatAddress(posted.serviceLocation);
  return (
    <div style={styles.subpanel}>
      <h3 style={styles.sectionHeading}>Posted record</h3>
      <p style={styles.tinyMuted}>
        Posted by {posted.postedByName} on {posted.postedAt.slice(0, 10)}.
      </p>
      <SummaryRow label="Bill to" value={posted.billTo.name} />
      {billToAddress ? <p style={styles.tinyMuted}>{billToAddress}</p> : null}
      <SummaryRow label="Service location" value={posted.serviceLocation.name} />
      {serviceAddress ? <p style={styles.tinyMuted}>{serviceAddress}</p> : null}
      <SummaryRow label="Job #" value={posted.jobNumber} />
      {posted.workOrderNumber ? (
        <SummaryRow label="Work order" value={posted.workOrderNumber} />
      ) : null}
    </div>
  );
}

export function InvoiceLineEditor({
  heading,
  draft,
  isSaving,
  onChange,
  onSave,
  onCancel
}: {
  heading: string;
  draft: InvoiceLineDraft;
  isSaving: boolean;
  onChange: (draft: InvoiceLineDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function patch(values: Partial<InvoiceLineDraft>) {
    onChange({ ...draft, ...values });
  }

  return (
    <div style={styles.drawerPanel}>
      <h3 style={styles.sectionHeading}>{heading}</h3>
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Kind</span>
          <select
            style={styles.input}
            value={draft.kind}
            onChange={(event) => patch({ kind: event.target.value as InvoiceLineDraft['kind'] })}
          >
            {invoiceLineKindOptions.map((kind) => (
              <option key={kind} value={kind}>
                {invoiceLineKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          <span>Description</span>
          <input
            style={styles.input}
            value={draft.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
      </div>
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Qty</span>
          <input
            style={styles.input}
            type="number"
            step="0.01"
            value={draft.quantity}
            onChange={(event) => patch({ quantity: event.target.value })}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Unit price</span>
          <input
            style={styles.input}
            type="number"
            step="0.01"
            value={draft.unitPrice}
            onChange={(event) => patch({ unitPrice: event.target.value })}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Unit cost</span>
          <input
            style={styles.input}
            type="number"
            step="0.01"
            value={draft.unitCost}
            onChange={(event) => patch({ unitCost: event.target.value })}
          />
        </label>
        <label style={styles.inlineLabel}>
          <input
            type="checkbox"
            checked={draft.taxable}
            onChange={(event) => patch({ taxable: event.target.checked })}
          />
          <span>Taxable</span>
        </label>
      </div>
      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onSave}>
          {isSaving ? 'Saving…' : 'Save line'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
