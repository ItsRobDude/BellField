'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addOfficeInvoiceLine,
  editOfficeInvoiceLine,
  getOfficeInvoiceForJob,
  postOfficeInvoice,
  voidOfficeInvoiceLine,
  type InvoiceLineItemSummary,
  type InvoiceSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildInvoiceLineDraft,
  createEmptyInvoiceLineDraft,
  invoiceLineKindLabels,
  parseInvoiceLineDraft,
  type InvoiceLineDraft
} from './job-invoice-types';
import {
  formatCurrency,
  InvoiceLineEditor,
  InvoiceTotals,
  invoiceSourceLabels,
  PostedInvoiceSummary,
  type InvoicePaymentPermissions
} from './job-invoice-shared';
import { JobInvoiceCorrections } from './job-invoice-corrections';

type JobInvoiceSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
  canPost: boolean;
  canCreateAdjustments: boolean;
  paymentPermissions: InvoicePaymentPermissions;
};

// The job's single main invoice draft: the running bill, fed by reflected
// register work plus manual office lines. Office users with invoices:edit can
// add, edit, and void lines; editing a register-sourced line detaches it from
// its register source on the server. Users with invoices:post can post (lock)
// the draft, which freezes its display context and stops further editing. Once
// posted, the corrections section (adjustments/credits + balance) appears below.
// All styling reuses officeWorkspaceStyles.
export function JobInvoiceSection({
  jobId,
  apiBaseUrl,
  sessionToken,
  canEdit,
  canPost,
  canCreateAdjustments,
  paymentPermissions
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

  async function postInvoice() {
    // Posting is a locking, accounting-significant action: confirm even when permitted.
    if (
      !window.confirm(
        'Post this invoice? Once posted it becomes the locked accounting record and can no longer be edited.'
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await postOfficeInvoice({ jobId, apiBaseUrl, sessionToken });
      applyResult(response.invoice, 'Invoice posted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to post the invoice.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
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
            {invoice && canPost && invoice.status === 'draft' && !newLineDraft && !editingLineId ? (
              <button
                type="button"
                style={styles.primaryButton}
                disabled={isSaving}
                onClick={() => void postInvoice()}
              >
                Post invoice
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
                            {invoiceLineKindLabels[line.kind]} ·{' '}
                            {invoiceSourceLabels[line.sourceKind]}
                            {line.sourceSyncState === 'detached' ? ' (edited)' : ''} ·{' '}
                            {line.quantity}
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
            {invoice.posted ? <PostedInvoiceSummary posted={invoice.posted} /> : null}
          </>
        )}
      </section>

      {invoice && invoice.status === 'posted' ? (
        <JobInvoiceCorrections
          jobId={jobId}
          mainInvoiceId={invoice.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canEdit={canEdit}
          canPost={canPost}
          canCreate={canCreateAdjustments}
          paymentPermissions={paymentPermissions}
        />
      ) : null}
    </>
  );
}
