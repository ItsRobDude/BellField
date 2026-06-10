import type { ReactNode } from 'react';
import type { EstimateSummary } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { estimateLineItemKindLabels, estimateStatusLabels } from './job-estimate-types';

export function EstimateList({
  estimates,
  selectedEstimateId,
  onSelect
}: {
  estimates: EstimateSummary[];
  selectedEstimateId: string | null;
  onSelect: (estimateId: string) => void;
}) {
  return (
    <section style={styles.subpanel} aria-label="Estimate list">
      <div style={styles.estimateListScroll}>
        {estimates.map((estimate) => {
          const isSelected = estimate.id === selectedEstimateId;
          return (
            <button
              key={estimate.id}
              type="button"
              aria-pressed={isSelected}
              style={{
                ...styles.cardButton,
                background: isSelected ? '#eef8f4' : '#ffffff',
                borderColor: isSelected ? '#176b5b' : '#dfe6df'
              }}
              onClick={() => onSelect(estimate.id)}
            >
              <div style={styles.row}>
                <strong>{estimate.title}</strong>
                <span style={estimate.status === 'declined' ? styles.dangerBadge : styles.badge}>
                  {estimateStatusLabels[estimate.status]}
                </span>
              </div>
              <p style={styles.tinyMuted}>
                {estimate.lineItems.length} line{estimate.lineItems.length === 1 ? '' : 's'} ·{' '}
                {formatCurrency(estimate.totals.total)}
                {estimate.validUntil ? ` · valid until ${estimate.validUntil}` : ''}
              </p>
              <div style={styles.badgeRow}>
                {estimate.selectedOptionId ? (
                  <span style={styles.badge}>
                    Option {formatOptionLabel(estimate, estimate.selectedOptionId)}
                  </span>
                ) : null}
                {estimate.lastSentAt ? <span style={styles.badge}>Sent</span> : null}
                {wasEditedSinceLastSend(estimate) ? (
                  <span style={styles.dangerBadge}>Edited since sent</span>
                ) : null}
                {estimate.convertedToInvoiceId ? <span style={styles.badge}>Converted</span> : null}
                {estimate.supersededByEstimateId ? (
                  <span style={styles.dangerBadge}>Superseded</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function EstimateDetailPanel({
  estimate,
  canEdit,
  canApprove,
  canSend,
  canConvert,
  isDeliveryPanelOpen,
  deliveryPanel,
  onEdit,
  onApprove,
  onDecline,
  onConvert,
  onDownload,
  onToggleDelivery
}: {
  estimate: EstimateSummary;
  canEdit: boolean;
  canApprove: boolean;
  canSend: boolean;
  canConvert: boolean;
  isDeliveryPanelOpen: boolean;
  deliveryPanel: ReactNode;
  onEdit: () => void;
  onApprove: (selectedOptionId?: string) => void;
  onDecline: () => void;
  onConvert: () => void;
  onDownload: () => void;
  onToggleDelivery: () => void;
}) {
  const isPending = estimate.status === 'pending';

  return (
    <article
      style={estimate.status === 'declined' ? styles.mutedPanel : styles.subpanel}
      aria-label="Selected estimate detail"
    >
      <div style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <strong>{estimate.title}</strong>
          <p style={styles.tinyMuted}>
            {estimate.lineItems.length} line{estimate.lineItems.length === 1 ? '' : 's'} ·{' '}
            {formatCurrency(estimate.totals.total)}
            {estimate.validUntil ? ` · valid until ${estimate.validUntil}` : ''}
          </p>
        </div>
        <div style={styles.badgeRow}>
          {estimate.lastSentAt ? (
            <span style={styles.tinyMuted}>Last sent {formatSentDate(estimate.lastSentAt)}</span>
          ) : null}
          {wasEditedSinceLastSend(estimate) ? (
            <span style={styles.dangerBadge}>Edited since sent</span>
          ) : null}
          <span style={estimate.status === 'declined' ? styles.dangerBadge : styles.badge}>
            {estimateStatusLabels[estimate.status]}
          </span>
        </div>
      </div>

      <EstimateLineItems estimate={estimate} />

      <EstimateOptions estimate={estimate} />

      <EstimateTotals estimate={estimate} />

      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.button} onClick={onDownload}>
          Download PDF
        </button>
        {isPending && canEdit ? (
          <button type="button" style={styles.button} onClick={onEdit}>
            Edit
          </button>
        ) : null}
        {isPending && canApprove ? (
          <>
            {estimate.optionGroups?.length ? (
              estimate.optionGroups.flatMap((group) =>
                group.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => onApprove(option.id)}
                  >
                    Mark {option.label} approved
                  </button>
                ))
              )
            ) : (
              <button type="button" style={styles.primaryButton} onClick={() => onApprove()}>
                Mark approved
              </button>
            )}
            <button type="button" style={styles.dangerButton} onClick={onDecline}>
              Decline
            </button>
          </>
        ) : null}
        {estimate.status === 'approved' && estimate.approvedByName ? (
          <span style={styles.tinyMuted}>Approved by {estimate.approvedByName}</span>
        ) : null}
        {(isPending || estimate.status === 'approved') &&
        canSend &&
        !estimate.supersededByEstimateId ? (
          <button type="button" style={styles.button} onClick={onToggleDelivery}>
            {isDeliveryPanelOpen ? 'Close send' : 'Send PDF'}
          </button>
        ) : null}
        {estimate.status === 'approved' && estimate.convertedToInvoiceId ? (
          <span style={styles.badge}>Converted to invoice</span>
        ) : estimate.status === 'approved' && canConvert ? (
          <button type="button" style={styles.primaryButton} onClick={onConvert}>
            Convert to invoice
          </button>
        ) : null}
        {estimate.status === 'declined' && estimate.declinedByName ? (
          <span style={styles.tinyMuted}>Declined by {estimate.declinedByName}</span>
        ) : null}
      </div>

      {deliveryPanel}
    </article>
  );
}

// Read-only line-item summary so a reviewer (who may not have edit access) can
// see exactly what is being quoted before approving or declining, and so
// approved/declined estimates remain inspectable.
function EstimateLineItems({ estimate }: { estimate: EstimateSummary }) {
  if (estimate.lineItems.length === 0) {
    return null;
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.tableHeadCell}>Item</th>
            <th style={styles.tableHeadCell}>Kind</th>
            <th style={styles.tableHeadCell}>Qty</th>
            <th style={styles.tableHeadCell}>Unit price</th>
            <th style={styles.tableHeadCell}>Line total</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lineItems.map((line) => (
            <tr key={line.id}>
              <td style={styles.tableCell}>
                {line.description}
                {line.taxable ? '' : ' (non-taxable)'}
                {line.catalogSnapshot ? (
                  <p style={styles.tinyMuted}>Catalog: {formatCatalogSnapshotLabel(line)}</p>
                ) : null}
                {line.optionId ? (
                  <p style={styles.tinyMuted}>
                    Option: {formatOptionLabel(estimate, line.optionId)}
                  </p>
                ) : null}
              </td>
              <td style={styles.tableCell}>{estimateLineItemKindLabels[line.kind]}</td>
              <td style={styles.tableCell}>
                {line.quantity}
                {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''}
              </td>
              <td style={styles.tableCell}>{formatCurrency(line.unitPrice)}</td>
              <td style={styles.tableCell}>{formatCurrency(line.lineSubtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstimateOptions({ estimate }: { estimate: EstimateSummary }) {
  if (!estimate.optionGroups?.length) {
    return null;
  }

  return (
    <div style={styles.subpanel}>
      {estimate.optionGroups.map((group) => (
        <div key={group.id}>
          <strong>{group.title}</strong>
          <div style={styles.formGridCompact}>
            {group.options.map((option) => (
              <div key={option.id} style={styles.panel}>
                <div style={styles.row}>
                  <span style={{ fontWeight: 800 }}>{option.label}</span>
                  {estimate.selectedOptionId === option.id ? (
                    <span style={styles.badge}>Selected</span>
                  ) : null}
                </div>
                <SummaryRow label="Total" value={formatCurrency(option.totals.total)} emphasize />
                <SummaryRow label="Profit" value={formatCurrency(option.totals.profit)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EstimateTotals({ estimate }: { estimate: EstimateSummary }) {
  const { totals } = estimate;
  return (
    <div style={styles.subpanel}>
      <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
      {totals.discount > 0 ? (
        <SummaryRow label="Discount" value={`−${formatCurrency(totals.discount)}`} />
      ) : null}
      <SummaryRow
        label={`Tax (${formatTaxRatePercent(estimate.taxRateBasisPoints)})`}
        value={formatCurrency(totals.tax)}
      />
      <SummaryRow label="Total" value={formatCurrency(totals.total)} emphasize />
      <SummaryRow label="Cost" value={formatCurrency(totals.totalCost)} />
      <SummaryRow
        label="Profit"
        value={`${formatCurrency(totals.profit)} (${formatMargin(totals.marginBasisPoints)})`}
      />
      {!totals.costComplete ? (
        <p style={styles.tinyMuted}>
          Some lines have no cost entered, so profit and margin are an optimistic ceiling.
        </p>
      ) : null}
    </div>
  );
}

function SummaryRow({
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

function formatCatalogSnapshotLabel(line: EstimateSummary['lineItems'][number]): string {
  const snapshot = line.catalogSnapshot;
  if (!snapshot) {
    return '';
  }
  return snapshot.code ? `${snapshot.name} (${snapshot.code})` : snapshot.name;
}

// The customer's copy is the snapshot from the last send; flag the estimate
// once later edits make the live version differ from what was emailed.
function wasEditedSinceLastSend(estimate: EstimateSummary): boolean {
  return (
    estimate.lastSentAt !== undefined &&
    estimate.lastSentSourceVersion !== undefined &&
    estimate.lastSentSourceVersion !== estimate.version
  );
}

function formatSentDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatOptionLabel(estimate: EstimateSummary, optionId: string): string {
  for (const group of estimate.optionGroups ?? []) {
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (option) {
      return option.label;
    }
  }
  return optionId;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}

function formatTaxRatePercent(basisPoints: number): string {
  return `${Number((basisPoints / 100).toFixed(2))}%`;
}

function formatMargin(marginBasisPoints: number | null): string {
  if (marginBasisPoints === null) {
    return 'n/a';
  }
  return `${(marginBasisPoints / 100).toFixed(1)}%`;
}
