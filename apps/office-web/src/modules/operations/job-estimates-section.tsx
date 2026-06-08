'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveOfficeEstimate,
  convertOfficeEstimateToInvoice,
  createOfficeEstimate,
  declineOfficeEstimate,
  getOfficeCatalogItems,
  getOfficeEstimatesForJob,
  updateOfficeEstimate,
  type CatalogItem,
  type EstimateSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { EstimateCatalogPicker } from './job-estimate-catalog-picker';
import {
  buildEstimateDraftFromSummary,
  createEmptyEstimateDraft,
  estimateLineItemKindLabels,
  estimateLineItemKindOptions,
  estimateStatusLabels,
  isUntouchedBlankEstimateLine,
  parseEstimateDraft,
  type EstimateDraft,
  type EstimateLineDraft
} from './job-estimate-types';

type JobEstimatesSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canConvert: boolean;
  canViewCatalog: boolean;
};

type CatalogLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Estimates attach to a job, so this section lives inside the job detail surface.
// It is self-contained: it fetches its own estimates and owns its draft state,
// mirroring how the CRM panel manages its own data. All styling reuses
// officeWorkspaceStyles so it reads as a native part of the office app.
export function JobEstimatesSection({
  jobId,
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit,
  canApprove,
  canConvert,
  canViewCatalog
}: JobEstimatesSectionProps) {
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogSearchText, setCatalogSearchText] = useState('');
  const [catalogLoadStatus, setCatalogLoadStatus] = useState<CatalogLoadStatus>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadEstimates = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeEstimatesForJob({ jobId, apiBaseUrl, sessionToken });
      setEstimates(response.estimates);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load estimates.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void loadEstimates();
  }, [loadEstimates]);

  const loadCatalog = useCallback(async () => {
    if (!canViewCatalog) {
      return;
    }
    setCatalogLoadStatus('loading');
    try {
      const response = await getOfficeCatalogItems({ apiBaseUrl, sessionToken });
      setCatalogItems(response.items);
      setCatalogLoadStatus('loaded');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the Catalog.');
      setCatalogLoadStatus('error');
    }
  }, [apiBaseUrl, canViewCatalog, sessionToken]);

  useEffect(() => {
    if (draft && canViewCatalog && catalogLoadStatus === 'idle') {
      void loadCatalog();
    }
  }, [canViewCatalog, catalogLoadStatus, draft, loadCatalog]);

  function startNewEstimate() {
    setEditingEstimateId(null);
    setDraft(createEmptyEstimateDraft());
    setCatalogLoadStatus('idle');
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function startEditEstimate(estimate: EstimateSummary) {
    setEditingEstimateId(estimate.id);
    setDraft(buildEstimateDraftFromSummary(estimate));
    setCatalogLoadStatus('idle');
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function cancelDraft() {
    setDraft(null);
    setEditingEstimateId(null);
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }

    const parsed = parseEstimateDraft(draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      if (editingEstimateId) {
        await updateOfficeEstimate({
          estimateId: editingEstimateId,
          apiBaseUrl,
          sessionToken,
          ...parsed.value
        });
        setNoticeMessage('Estimate updated.');
      } else {
        await createOfficeEstimate({ jobId, apiBaseUrl, sessionToken, ...parsed.value });
        setNoticeMessage('Estimate created.');
      }
      cancelDraft();
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the estimate.');
    } finally {
      setIsSaving(false);
    }
  }

  async function approve(estimateId: string) {
    if (!window.confirm('Approve this estimate? Approved estimates can no longer be edited.')) {
      return;
    }
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await approveOfficeEstimate({ estimateId, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate approved.');
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to approve the estimate.');
    }
  }

  async function decline(estimateId: string) {
    if (!window.confirm('Decline this estimate?')) {
      return;
    }
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await declineOfficeEstimate({ estimateId, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate declined.');
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to decline the estimate.');
    }
  }

  async function convert(estimateId: string, mode?: 'append' | 'replace') {
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await convertOfficeEstimateToInvoice({ estimateId, mode, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate converted to the invoice draft. See the Invoice tab.');
      await loadEstimates();
    } catch (error) {
      // The API blocks with a choice when the draft already has lines; offer it.
      const message = error instanceof Error ? error.message : 'Unable to convert the estimate.';
      if (!mode && /append.*replace|replace.*append/i.test(message)) {
        const replace = window.confirm(
          'The invoice draft already has lines.\n\nOK = replace them with this estimate.\nCancel = add this estimate to the existing lines.'
        );
        await convert(estimateId, replace ? 'replace' : 'append');
        return;
      }
      setErrorMessage(message);
    }
  }

  return (
    <section style={styles.panel} aria-label="Job estimates">
      <div style={styles.row}>
        <h2 style={styles.heading}>Estimates</h2>
        {canCreate && !draft ? (
          <button type="button" style={styles.primaryButton} onClick={startNewEstimate}>
            New estimate
          </button>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      {draft ? (
        <EstimateEditor
          draft={draft}
          isSaving={isSaving}
          isEditing={editingEstimateId !== null}
          canViewCatalog={canViewCatalog}
          catalogItems={catalogItems}
          catalogSearchText={catalogSearchText}
          isCatalogLoading={catalogLoadStatus === 'loading'}
          onChange={setDraft}
          onCatalogSearchChange={setCatalogSearchText}
          onReloadCatalog={() => void loadCatalog()}
          onCancel={cancelDraft}
          onSave={() => void saveDraft()}
        />
      ) : null}

      {isLoading ? (
        <p style={styles.muted}>Loading estimates…</p>
      ) : estimates.length === 0 && !draft ? (
        <p style={styles.muted}>No estimates yet for this job.</p>
      ) : (
        <div style={styles.list}>
          {estimates.map((estimate) => (
            <EstimateCard
              key={estimate.id}
              estimate={estimate}
              canEdit={canEdit}
              canApprove={canApprove}
              canConvert={canConvert}
              onEdit={() => startEditEstimate(estimate)}
              onApprove={() => void approve(estimate.id)}
              onDecline={() => void decline(estimate.id)}
              onConvert={() => void convert(estimate.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EstimateCard({
  estimate,
  canEdit,
  canApprove,
  canConvert,
  onEdit,
  onApprove,
  onDecline,
  onConvert
}: {
  estimate: EstimateSummary;
  canEdit: boolean;
  canApprove: boolean;
  canConvert: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onConvert: () => void;
}) {
  const isPending = estimate.status === 'pending';

  return (
    <article style={estimate.status === 'declined' ? styles.mutedPanel : styles.panel}>
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
          <span style={estimate.status === 'declined' ? styles.dangerBadge : styles.badge}>
            {estimateStatusLabels[estimate.status]}
          </span>
        </div>
      </div>

      <EstimateLineItems estimate={estimate} />

      <EstimateTotals estimate={estimate} />

      <div style={styles.inlineActionBar}>
        {isPending && canEdit ? (
          <button type="button" style={styles.button} onClick={onEdit}>
            Edit
          </button>
        ) : null}
        {isPending && canApprove ? (
          <>
            <button type="button" style={styles.primaryButton} onClick={onApprove}>
              Approve
            </button>
            <button type="button" style={styles.dangerButton} onClick={onDecline}>
              Decline
            </button>
          </>
        ) : null}
        {estimate.status === 'approved' && estimate.approvedByName ? (
          <span style={styles.tinyMuted}>Approved by {estimate.approvedByName}</span>
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

function EstimateTotals({ estimate }: { estimate: EstimateSummary }) {
  const { totals } = estimate;
  return (
    <div style={styles.subpanel}>
      <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
      {totals.discount > 0 ? (
        <SummaryRow label="Discount" value={`−${formatCurrency(totals.discount)}`} />
      ) : null}
      <SummaryRow label="Tax" value={formatCurrency(totals.tax)} />
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

function EstimateEditor({
  draft,
  isSaving,
  isEditing,
  canViewCatalog,
  catalogItems,
  catalogSearchText,
  isCatalogLoading,
  onChange,
  onCatalogSearchChange,
  onReloadCatalog,
  onCancel,
  onSave
}: {
  draft: EstimateDraft;
  isSaving: boolean;
  isEditing: boolean;
  canViewCatalog: boolean;
  catalogItems: CatalogItem[];
  catalogSearchText: string;
  isCatalogLoading: boolean;
  onChange: (draft: EstimateDraft) => void;
  onCatalogSearchChange: (value: string) => void;
  onReloadCatalog: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function patch(values: Partial<EstimateDraft>) {
    onChange({ ...draft, ...values });
  }

  function patchLine(index: number, values: Partial<EstimateLineDraft>) {
    onChange({
      ...draft,
      lineItems: draft.lineItems.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...values } : line
      )
    });
  }

  function addLine() {
    onChange({
      ...draft,
      lineItems: [
        ...draft.lineItems,
        {
          kind: 'part',
          description: '',
          quantity: '1',
          unitOfMeasure: '',
          unitPrice: '',
          unitCost: '',
          taxable: true
        }
      ]
    });
  }

  function addCatalogLine(line: EstimateLineDraft) {
    onChange({
      ...draft,
      lineItems:
        draft.lineItems.length === 1 && isUntouchedBlankEstimateLine(draft.lineItems[0])
          ? [line]
          : [...draft.lineItems, line]
    });
  }

  function removeLine(index: number) {
    onChange({
      ...draft,
      lineItems: draft.lineItems.filter((_, lineIndex) => lineIndex !== index)
    });
  }

  return (
    <div style={styles.drawerPanel}>
      <h3 style={styles.sectionHeading}>{isEditing ? 'Edit estimate' : 'New estimate'}</h3>

      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Title</span>
          <input
            style={styles.input}
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Tax rate (%)</span>
          <input
            style={styles.input}
            type="number"
            step="0.01"
            value={draft.taxRatePercent}
            onChange={(event) => patch({ taxRatePercent: event.target.value })}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Valid until</span>
          <input
            style={styles.input}
            type="date"
            value={draft.validUntil}
            onChange={(event) => patch({ validUntil: event.target.value })}
          />
        </label>
      </div>

      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Discount type</span>
          <select
            style={styles.input}
            value={draft.discountKind}
            onChange={(event) =>
              patch({ discountKind: event.target.value as EstimateDraft['discountKind'] })
            }
          >
            <option value="none">None</option>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed ($)</option>
          </select>
        </label>
        {draft.discountKind !== 'none' ? (
          <label style={styles.fieldLabel}>
            <span>{draft.discountKind === 'percent' ? 'Discount (%)' : 'Discount ($)'}</span>
            <input
              style={styles.input}
              type="number"
              step="0.01"
              value={draft.discountValue}
              onChange={(event) => patch({ discountValue: event.target.value })}
            />
          </label>
        ) : null}
      </div>

      <div style={styles.formSection}>
        <div style={styles.row}>
          <h4 style={styles.sectionHeading}>Line items</h4>
          <button type="button" style={styles.button} onClick={addLine}>
            Add line
          </button>
        </div>

        {canViewCatalog ? (
          <EstimateCatalogPicker
            items={catalogItems}
            searchText={catalogSearchText}
            isLoading={isCatalogLoading}
            onSearchChange={onCatalogSearchChange}
            onReload={onReloadCatalog}
            onAddLine={addCatalogLine}
          />
        ) : null}

        {draft.lineItems.length === 0 ? (
          <p style={styles.tinyMuted}>Add at least one line item.</p>
        ) : (
          draft.lineItems.map((line, index) => (
            <div key={index} style={styles.subpanel}>
              <div style={styles.formGridCompact}>
                <label style={styles.fieldLabel}>
                  <span>Kind</span>
                  <select
                    style={styles.input}
                    value={line.kind}
                    onChange={(event) =>
                      patchLine(index, { kind: event.target.value as EstimateLineDraft['kind'] })
                    }
                  >
                    {estimateLineItemKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {estimateLineItemKindLabels[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
                  <span>Description</span>
                  <input
                    style={styles.input}
                    value={line.description}
                    onChange={(event) => patchLine(index, { description: event.target.value })}
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
                    value={line.quantity}
                    onChange={(event) => patchLine(index, { quantity: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  <span>Unit price</span>
                  <input
                    style={styles.input}
                    type="number"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => patchLine(index, { unitPrice: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  <span>Unit cost</span>
                  <input
                    style={styles.input}
                    type="number"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(event) => patchLine(index, { unitCost: event.target.value })}
                  />
                </label>
                <label style={styles.inlineLabel}>
                  <input
                    type="checkbox"
                    checked={line.taxable}
                    onChange={(event) => patchLine(index, { taxable: event.target.checked })}
                  />
                  <span>Taxable</span>
                </label>
              </div>
              <div style={styles.row}>
                <span style={styles.tinyMuted}>Line {index + 1}</span>
                <button type="button" style={styles.dangerButton} onClick={() => removeLine(index)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onSave}>
          {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create estimate'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}

function formatMargin(marginBasisPoints: number | null): string {
  if (marginBasisPoints === null) {
    return 'n/a';
  }
  return `${(marginBasisPoints / 100).toFixed(1)}%`;
}
