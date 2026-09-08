import type { ReactNode } from 'react';
import type { EstimateSummary } from '@/lib/operations-api';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMarginPercent,
  formatTaxRatePercent
} from '@/lib/format';
import { ConfirmAction } from '@/components/confirm-action';
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
          const acceptanceBadgeLabel = estimateAcceptanceBadgeLabel(estimate);
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
                {estimate.validUntil ? ` · valid until ${formatDate(estimate.validUntil)}` : ''}
              </p>
              <div style={styles.badgeRow}>
                {estimate.selectedOptionId ? (
                  <span style={styles.badge}>
                    Option {formatOptionLabel(estimate, estimate.selectedOptionId)}
                  </span>
                ) : null}
                {estimate.lastSentAt ? <span style={styles.badge}>Sent</span> : null}
                {acceptanceBadgeLabel ? (
                  <span style={estimate.status === 'declined' ? styles.dangerBadge : styles.badge}>
                    {acceptanceBadgeLabel}
                  </span>
                ) : null}
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
  isActionPending,
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
  /** True while an approve/decline/convert/download is in flight. */
  isActionPending: boolean;
  isDeliveryPanelOpen: boolean;
  deliveryPanel: ReactNode;
  onEdit: () => void;
  onApprove: (selectedOptionId?: string) => Promise<void>;
  onDecline: () => Promise<void>;
  onConvert: () => void;
  onDownload: () => void;
  onToggleDelivery: () => void;
}) {
  const isPending = estimate.status === 'pending';
  const acceptanceDetailText = estimateAcceptanceDetailText(estimate);

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
            {estimate.validUntil ? ` · valid until ${formatDate(estimate.validUntil)}` : ''}
          </p>
          {acceptanceDetailText ? <p style={styles.tinyMuted}>{acceptanceDetailText}</p> : null}
        </div>
        <div style={styles.badgeRow}>
          {estimate.lastSentAt ? (
            <span style={styles.tinyMuted}>Last sent {formatDateTime(estimate.lastSentAt)}</span>
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
        <button type="button" style={styles.button} disabled={isActionPending} onClick={onDownload}>
          Download PDF
        </button>
        {isPending && canEdit ? (
          <button type="button" style={styles.button} disabled={isActionPending} onClick={onEdit}>
            Edit
          </button>
        ) : null}
        {isPending && canApprove ? (
          <>
            {estimate.optionGroups?.length ? (
              estimate.optionGroups.flatMap((group) =>
                group.options.map((option) => (
                  <ConfirmAction
                    key={option.id}
                    variant="primary"
                    disabled={isActionPending}
                    label={`Mark ${option.label} approved`}
                    title={`Mark ${option.label} approved?`}
                    description="Approved estimates can no longer be edited."
                    confirmLabel="Mark approved"
                    busyLabel="Approving…"
                    onConfirm={() => onApprove(option.id)}
                  />
                ))
              )
            ) : (
              <ConfirmAction
                variant="primary"
                disabled={isActionPending}
                label="Mark approved"
                title="Mark this estimate approved?"
                description="Approved estimates can no longer be edited."
                confirmLabel="Mark approved"
                busyLabel="Approving…"
                onConfirm={() => onApprove()}
              />
            )}
            <ConfirmAction
              variant="danger"
              disabled={isActionPending}
              label="Decline"
              title="Decline this estimate?"
              confirmLabel="Decline estimate"
              busyLabel="Declining…"
              onConfirm={onDecline}
            />
          </>
        ) : null}
        {estimate.status === 'approved' && estimate.approvedByName ? (
          <span style={styles.tinyMuted}>Approved by {estimate.approvedByName}</span>
        ) : null}
        {(isPending || estimate.status === 'approved') &&
        canSend &&
        !estimate.supersededByEstimateId ? (
          <button type="button" style={styles.button} onClick={onToggleDelivery}>
            {isDeliveryPanelOpen ? 'Close' : 'Email estimate'}
          </button>
        ) : null}
        {estimate.status === 'approved' && estimate.convertedToInvoiceId ? (
          <span style={styles.badge}>Converted to invoice</span>
        ) : estimate.status === 'approved' && canConvert ? (
          <button
            type="button"
            style={styles.primaryButton}
            disabled={isActionPending}
            onClick={onConvert}
          >
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
            <th style={styles.tableHeadCell}>Line type</th>
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
  const firstOptionLabel = estimate.optionGroups?.[0]?.options[0]?.label;
  return (
    <div style={styles.subpanel}>
      {estimate.optionGroups?.length ? (
        <p style={styles.tinyMuted}>
          {estimate.selectedOptionId
            ? `Totals reflect the ${formatOptionLabel(estimate, estimate.selectedOptionId)} option.`
            : `No option chosen yet — totals reflect ${firstOptionLabel ?? 'the first option'}.`}
        </p>
      ) : null}
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
        value={`${formatCurrency(totals.profit)} (${formatMarginPercent(totals.marginBasisPoints)})`}
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

function estimateAcceptanceBadgeLabel(estimate: EstimateSummary): string | null {
  if (estimate.latestAcceptanceDecisionAppliedAt) {
    if (wasApprovedByCustomerOnline(estimate)) {
      return 'Customer approved';
    }
    if (wasDeclinedByCustomerOnline(estimate)) {
      return 'Customer declined';
    }
    return 'Customer responded';
  }
  if (!estimate.latestAcceptanceLinkExpiresAt) {
    return null;
  }
  return isPastDateTime(estimate.latestAcceptanceLinkExpiresAt)
    ? 'Link expired'
    : 'Awaiting customer';
}

function estimateAcceptanceDetailText(estimate: EstimateSummary): string | null {
  if (estimate.latestAcceptanceDecisionAppliedAt) {
    const at = formatDateTime(estimate.latestAcceptanceDecisionAppliedAt);
    if (wasApprovedByCustomerOnline(estimate)) {
      return `Customer approved online ${at}.`;
    }
    if (wasDeclinedByCustomerOnline(estimate)) {
      return `Customer declined online ${at}.`;
    }
    return `Customer response recorded ${at}.`;
  }
  if (!estimate.latestAcceptanceLinkExpiresAt) {
    return null;
  }
  const at = formatDateTime(estimate.latestAcceptanceLinkExpiresAt);
  return isPastDateTime(estimate.latestAcceptanceLinkExpiresAt)
    ? `Customer response link expired ${at}.`
    : `Awaiting customer response · link expires ${at}.`;
}

function wasApprovedByCustomerOnline(estimate: EstimateSummary): boolean {
  return (
    estimate.status === 'approved' &&
    estimate.latestAcceptanceDecisionAppliedAt !== undefined &&
    estimate.approvedByEmployeeId === undefined &&
    estimate.approvedByName === 'Customer'
  );
}

function wasDeclinedByCustomerOnline(estimate: EstimateSummary): boolean {
  return (
    estimate.status === 'declined' &&
    estimate.latestAcceptanceDecisionAppliedAt !== undefined &&
    estimate.declinedByEmployeeId === undefined &&
    estimate.declinedByName === 'Customer'
  );
}

function isPastDateTime(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
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
