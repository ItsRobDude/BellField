'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addOfficeInvoiceLine,
  editOfficeInvoiceLine,
  getOfficeInvoiceForJob,
  voidOfficeInvoiceLine,
  type InvoiceLineItemSummary,
  type InvoiceSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildInvoiceLineDraft,
  createEmptyInvoiceLineDraft,
  invoiceLineKindLabels,
  invoiceLineKindOptions,
  parseInvoiceLineDraft,
  type InvoiceLineDraft
} from './job-invoice-types';

type JobInvoiceSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
};

const sourceLabels: Record<InvoiceLineItemSummary['sourceKind'], string> = {
  manual: 'Office',
  register: 'Register',
  estimate: 'Estimate'
};

// The job's single main invoice draft: the running bill, fed by reflected
// register work plus manual office lines. Office users with invoices:edit can
// add, edit, and void lines; editing a register-sourced line detaches it from
// its register source on the server. All styling reuses officeWorkspaceStyles.
export function JobInvoiceSection({
  jobId,
  apiBaseUrl,
  sessionToken,
  canEdit
}: JobInvoiceSectionProps) {
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [newLineDraft, setNewLineDraft] = useState<InvoiceLineDraft | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<InvoiceLineDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadInvoice = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeInvoiceForJob({ jobId, apiBaseUrl, sessionToken });
      setInvoice(response.invoice);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the invoice draft.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  function applyResult(next: InvoiceSummary, notice: string) {
    setInvoice(next);
    setNoticeMessage(notice);
    setErrorMessage(null);
  }

  async function addLine() {
    if (!newLineDraft) return;
    const parsed = parseInvoiceLineDraft(newLineDraft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setIsSaving(true);
    try {
      const response = await addOfficeInvoiceLine({
        jobId,
        apiBaseUrl,
        sessionToken,
        ...parsed.value
      });
      applyResult(response.invoice, 'Line added.');
      setNewLineDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEdit(lineId: string) {
    if (!editDraft) return;
    const parsed = parseInvoiceLineDraft(editDraft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setIsSaving(true);
    try {
      const response = await editOfficeInvoiceLine({
        lineId,
        apiBaseUrl,
        sessionToken,
        ...parsed.value
      });
      applyResult(response.invoice, 'Line updated.');
      setEditingLineId(null);
      setEditDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function voidLine(line: InvoiceLineItemSummary) {
    if (!window.confirm(`Remove "${line.description}" from the invoice?`)) return;
    setIsSaving(true);
    try {
      const response = await voidOfficeInvoiceLine({ lineId: line.id, apiBaseUrl, sessionToken });
      applyResult(response.invoice, 'Line removed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to remove the line.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section style={styles.panel} aria-label="Job invoice draft">
      <div style={styles.row}>
        <h2 style={styles.heading}>Invoice draft</h2>
        <div style={styles.badgeRow}>
          {invoice ? (
            <span style={styles.badge}>{invoice.status === 'posted' ? 'Posted' : 'Draft'}</span>
          ) : null}
          {invoice && canEdit && invoice.status === 'draft' && !newLineDraft ? (
            <button
              type="button"
              style={styles.button}
              onClick={() => setNewLineDraft(createEmptyInvoiceLineDraft())}
            >
              Add line
            </button>
          ) : null}
        </div>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      {newLineDraft ? (
        <InvoiceLineEditor
          heading="New line"
          draft={newLineDraft}
          isSaving={isSaving}
          onChange={setNewLineDraft}
          onSave={() => void addLine()}
          onCancel={() => setNewLineDraft(null)}
        />
      ) : null}

      {isLoading ? (
        <p style={styles.muted}>Loading invoice draft…</p>
      ) : !invoice ? (
        <p style={styles.muted}>No invoice draft for this job yet.</p>
      ) : (
        <>
          {invoice.lineItems.length === 0 ? (
            <p style={styles.muted}>
              This draft is empty. Register work and converted estimates appear here.
            </p>
          ) : (
            <div style={styles.list}>
              {invoice.lineItems.map((line) =>
                editingLineId === line.id && editDraft ? (
                  <InvoiceLineEditor
                    key={line.id}
                    heading={`Edit: ${line.description}`}
                    draft={editDraft}
                    isSaving={isSaving}
                    onChange={setEditDraft}
                    onSave={() => void saveEdit(line.id)}
                    onCancel={() => {
                      setEditingLineId(null);
                      setEditDraft(null);
                    }}
                  />
                ) : (
                  <div key={line.id} style={styles.subpanel}>
                    <div style={styles.row}>
                      <div style={{ minWidth: 0 }}>
                        <strong>{line.description}</strong>
                        <p style={styles.tinyMuted}>
                          {invoiceLineKindLabels[line.kind]} · {sourceLabels[line.sourceKind]}
                          {line.sourceSyncState === 'detached' ? ' (edited)' : ''} · {line.quantity}
                          {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''} ×{' '}
                          {formatCurrency(line.unitPrice)}
                          {line.taxable ? '' : ' · non-taxable'}
                        </p>
                      </div>
                      <div style={styles.badgeRow}>
                        <strong>{formatCurrency(line.lineSubtotal)}</strong>
                        {canEdit && invoice.status === 'draft' ? (
                          <>
                            <button
                              type="button"
                              style={styles.button}
                              onClick={() => {
                                setEditingLineId(line.id);
                                setEditDraft(buildInvoiceLineDraft(line));
                                setNewLineDraft(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              style={styles.dangerButton}
                              onClick={() => void voidLine(line)}
                            >
                              Remove
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
          <InvoiceTotals invoice={invoice} />
        </>
      )}
    </section>
  );
}

function InvoiceLineEditor({
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

function InvoiceTotals({ invoice }: { invoice: InvoiceSummary }) {
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}
