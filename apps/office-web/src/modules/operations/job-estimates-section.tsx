'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveOfficeEstimate,
  convertOfficeEstimateToInvoice,
  createOfficeEstimate,
  declineOfficeEstimate,
  downloadOfficeEstimateDocument,
  getOfficeEstimateOutboundMessages,
  getOfficeCatalogItems,
  getOfficeEstimatesForJob,
  sendOfficeEstimate,
  updateOfficeEstimate,
  type CatalogItem,
  type EstimateSummary,
  type OutboundMessageSummary
} from '@/lib/operations-api';
import { downloadBlob } from '@/lib/download-file';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { EstimateEditor } from './job-estimate-editor';
import {
  buildEstimateDraftFromSummary,
  createEmptyEstimateDraft,
  estimateLineItemKindLabels,
  estimateStatusLabels,
  parseEstimateDraft,
  type EstimateDraft
} from './job-estimate-types';

type JobEstimatesSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canSend: boolean;
  canConvert: boolean;
  canViewCatalog: boolean;
  billToCustomerEmail?: string;
};

type CatalogLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
type EstimateDeliveryDraft = {
  recipientEmail: string;
  subject: string;
  bodyText: string;
};

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
  canSend,
  canConvert,
  canViewCatalog,
  billToCustomerEmail
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
  const [deliveryPanelEstimateId, setDeliveryPanelEstimateId] = useState<string | null>(null);
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, EstimateDeliveryDraft>>({});
  const [outboundMessagesByEstimateId, setOutboundMessagesByEstimateId] = useState<
    Record<string, OutboundMessageSummary[]>
  >({});
  const [historyLoadingEstimateId, setHistoryLoadingEstimateId] = useState<string | null>(null);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(null);

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

  async function approve(estimateId: string, selectedOptionId?: string) {
    if (!window.confirm('Approve this estimate? Approved estimates can no longer be edited.')) {
      return;
    }
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await approveOfficeEstimate({ estimateId, selectedOptionId, apiBaseUrl, sessionToken });
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

  async function downloadEstimate(estimate: EstimateSummary) {
    setErrorMessage(null);
    try {
      const blob = await downloadOfficeEstimateDocument({
        estimateId: estimate.id,
        apiBaseUrl,
        sessionToken
      });
      downloadBlob(`estimate-${safeFilenamePart(estimate.title)}-${estimate.id}.html`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download the estimate.');
    }
  }

  async function loadDeliveryHistory(estimateId: string) {
    setHistoryLoadingEstimateId(estimateId);
    setErrorMessage(null);
    try {
      const response = await getOfficeEstimateOutboundMessages({
        estimateId,
        apiBaseUrl,
        sessionToken
      });
      setOutboundMessagesByEstimateId((current) => ({
        ...current,
        [estimateId]: response.outboundMessages
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load estimate delivery history.'
      );
    } finally {
      setHistoryLoadingEstimateId((current) => (current === estimateId ? null : current));
    }
  }

  function toggleDeliveryPanel(estimate: EstimateSummary) {
    setNoticeMessage(null);
    setErrorMessage(null);
    setDeliveryPanelEstimateId((current) => {
      const next = current === estimate.id ? null : estimate.id;
      if (next) {
        setDeliveryDrafts((drafts) => ({
          ...drafts,
          [estimate.id]: drafts[estimate.id] ?? {
            recipientEmail: billToCustomerEmail ?? '',
            subject: '',
            bodyText: ''
          }
        }));
        void loadDeliveryHistory(estimate.id);
      }
      return next;
    });
  }

  function updateDeliveryDraft(estimateId: string, patch: Partial<EstimateDeliveryDraft>) {
    setDeliveryDrafts((current) => ({
      ...current,
      [estimateId]: {
        ...(current[estimateId] ?? {
          recipientEmail: billToCustomerEmail ?? '',
          subject: '',
          bodyText: ''
        }),
        ...patch
      }
    }));
  }

  async function sendEstimate(estimate: EstimateSummary) {
    const draft = deliveryDrafts[estimate.id];
    const recipientEmail = draft?.recipientEmail.trim() ?? '';
    if (!recipientEmail) {
      setErrorMessage('Recipient email is required.');
      return;
    }
    if (!window.confirm(`Send this estimate to ${recipientEmail}?`)) {
      return;
    }

    setSendingEstimateId(estimate.id);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const response = await sendOfficeEstimate({
        estimateId: estimate.id,
        apiBaseUrl,
        sessionToken,
        recipientEmail,
        subject: draft?.subject.trim() || undefined,
        bodyText: draft?.bodyText.trim() || undefined
      });
      setNoticeMessage(
        response.outboundMessage.status === 'sent' ? 'Estimate sent.' : 'Estimate delivery failed.'
      );
      await loadDeliveryHistory(estimate.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send the estimate.');
    } finally {
      setSendingEstimateId((current) => (current === estimate.id ? null : current));
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
              canSend={canSend}
              canConvert={canConvert}
              deliveryDraft={deliveryDrafts[estimate.id]}
              deliveryHistory={outboundMessagesByEstimateId[estimate.id] ?? []}
              isDeliveryPanelOpen={deliveryPanelEstimateId === estimate.id}
              isDeliveryHistoryLoading={historyLoadingEstimateId === estimate.id}
              isSending={sendingEstimateId === estimate.id}
              onEdit={() => startEditEstimate(estimate)}
              onApprove={(selectedOptionId) => void approve(estimate.id, selectedOptionId)}
              onDecline={() => void decline(estimate.id)}
              onConvert={() => void convert(estimate.id)}
              onDownload={() => void downloadEstimate(estimate)}
              onToggleDelivery={() => toggleDeliveryPanel(estimate)}
              onDeliveryDraftChange={(patch) => updateDeliveryDraft(estimate.id, patch)}
              onSend={() => void sendEstimate(estimate)}
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
  canSend,
  canConvert,
  deliveryDraft,
  deliveryHistory,
  isDeliveryPanelOpen,
  isDeliveryHistoryLoading,
  isSending,
  onEdit,
  onApprove,
  onDecline,
  onConvert,
  onDownload,
  onToggleDelivery,
  onDeliveryDraftChange,
  onSend
}: {
  estimate: EstimateSummary;
  canEdit: boolean;
  canApprove: boolean;
  canSend: boolean;
  canConvert: boolean;
  deliveryDraft?: EstimateDeliveryDraft;
  deliveryHistory: OutboundMessageSummary[];
  isDeliveryPanelOpen: boolean;
  isDeliveryHistoryLoading: boolean;
  isSending: boolean;
  onEdit: () => void;
  onApprove: (selectedOptionId?: string) => void;
  onDecline: () => void;
  onConvert: () => void;
  onDownload: () => void;
  onToggleDelivery: () => void;
  onDeliveryDraftChange: (patch: Partial<EstimateDeliveryDraft>) => void;
  onSend: () => void;
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

      <EstimateOptions estimate={estimate} />

      <EstimateTotals estimate={estimate} />

      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.button} onClick={onDownload}>
          Download estimate
        </button>
        {isPending && canEdit ? (
          <button type="button" style={styles.button} onClick={onEdit}>
            Edit
          </button>
        ) : null}
        {isPending && canApprove && estimate.optionGroups?.length ? (
          estimate.optionGroups.flatMap((group) =>
            group.options.map((option) => (
              <button
                key={option.id}
                type="button"
                style={styles.primaryButton}
                onClick={() => onApprove(option.id)}
              >
                Approve {option.label}
              </button>
            ))
          )
        ) : isPending && canApprove ? (
          <>
            <button type="button" style={styles.primaryButton} onClick={() => onApprove()}>
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
        {estimate.status === 'approved' && canSend ? (
          <button type="button" style={styles.button} onClick={onToggleDelivery}>
            {isDeliveryPanelOpen ? 'Close send' : 'Send estimate'}
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

      {isDeliveryPanelOpen ? (
        <EstimateDeliveryPanel
          draft={
            deliveryDraft ?? {
              recipientEmail: '',
              subject: '',
              bodyText: ''
            }
          }
          history={deliveryHistory}
          isHistoryLoading={isDeliveryHistoryLoading}
          isSending={isSending}
          onChange={onDeliveryDraftChange}
          onSend={onSend}
        />
      ) : null}
    </article>
  );
}

function EstimateDeliveryPanel({
  draft,
  history,
  isHistoryLoading,
  isSending,
  onChange,
  onSend
}: {
  draft: EstimateDeliveryDraft;
  history: OutboundMessageSummary[];
  isHistoryLoading: boolean;
  isSending: boolean;
  onChange: (patch: Partial<EstimateDeliveryDraft>) => void;
  onSend: () => void;
}) {
  return (
    <section style={styles.subpanel} aria-label="Estimate delivery">
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          Recipient email
          <input
            aria-label="Estimate recipient email"
            value={draft.recipientEmail}
            onChange={(event) => onChange({ recipientEmail: event.target.value })}
            style={styles.input}
          />
        </label>
        <label style={styles.fieldLabel}>
          Subject
          <input
            aria-label="Estimate email subject"
            value={draft.subject}
            placeholder="Use settings default"
            onChange={(event) => onChange({ subject: event.target.value })}
            style={styles.input}
          />
        </label>
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          Body
          <textarea
            aria-label="Estimate email body"
            value={draft.bodyText}
            placeholder="Use settings default"
            onChange={(event) => onChange({ bodyText: event.target.value })}
            style={styles.textarea}
          />
        </label>
      </div>
      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.primaryButton} disabled={isSending} onClick={onSend}>
          {isSending ? 'Sending...' : 'Send PDF'}
        </button>
      </div>
      <EstimateDeliveryHistory history={history} isLoading={isHistoryLoading} />
    </section>
  );
}

function EstimateDeliveryHistory({
  history,
  isLoading
}: {
  history: OutboundMessageSummary[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p style={styles.tinyMuted}>Loading delivery history...</p>;
  }
  if (history.length === 0) {
    return <p style={styles.tinyMuted}>No sends recorded.</p>;
  }

  return (
    <div style={styles.listCompact} aria-label="Estimate delivery history">
      {history.map((message) => (
        <div key={message.id} style={styles.row}>
          <span>
            <strong>{message.recipientEmail}</strong>{' '}
            <span style={styles.tinyMuted}>{formatDateTime(message.queuedAt)}</span>
          </span>
          <span style={message.status === 'failed' ? styles.dangerBadge : styles.badge}>
            {deliveryStatusLabel(message.status)}
          </span>
          {message.providerError ? (
            <span style={styles.tinyMuted}>{message.providerError}</span>
          ) : null}
        </div>
      ))}
    </div>
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

function formatCatalogSnapshotLabel(line: EstimateSummary['lineItems'][number]): string {
  const snapshot = line.catalogSnapshot;
  if (!snapshot) {
    return '';
  }
  return snapshot.code ? `${snapshot.name} (${snapshot.code})` : snapshot.name;
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

function formatMargin(marginBasisPoints: number | null): string {
  if (marginBasisPoints === null) {
    return 'n/a';
  }
  return `${(marginBasisPoints / 100).toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function deliveryStatusLabel(status: OutboundMessageSummary['status']): string {
  if (status === 'sent') return 'Sent';
  if (status === 'failed') return 'Failed';
  if (status === 'delivered') return 'Delivered';
  if (status === 'bounced') return 'Bounced';
  if (status === 'complained') return 'Complaint';
  return 'Queued';
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'estimate';
}
