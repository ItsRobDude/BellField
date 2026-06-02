'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addOfficeInvoiceLineById,
  createOfficeJobAdjustment,
  getOfficeJobInvoiceBalance,
  listOfficeJobAdjustments,
  postOfficeInvoiceById,
  voidOfficeInvoiceLine,
  type InvoiceAdjustmentKind,
  type InvoiceLineItemSummary,
  type InvoiceSummary,
  type JobInvoiceBalance
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  formatCurrency,
  InvoiceLineEditor,
  InvoiceTotals,
  invoiceSourceLabels,
  PostedInvoiceSummary,
  SummaryRow
} from './job-invoice-shared';
import {
  createEmptyInvoiceLineDraft,
  invoiceLineKindLabels,
  parseInvoiceLineDraft,
  type InvoiceLineDraft
} from './job-invoice-types';

type JobInvoiceCorrectionsProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
  canPost: boolean;
  canCreate: boolean;
};

const correctionKindLabels: Record<InvoiceAdjustmentKind, string> = {
  adjustment: 'Adjustment',
  credit: 'Credit'
};

// The job-level correction surface, shown once the main invoice is posted. It shows the
// net billed balance and the adjustment/credit records (each its own draft→posted invoice),
// reusing the same line editor and money formatting as the main draft. Adjustments add a
// charge; credits reduce what's owed. Both are created as drafts, edited, then posted.
export function JobInvoiceCorrections({
  jobId,
  apiBaseUrl,
  sessionToken,
  canEdit,
  canPost,
  canCreate
}: JobInvoiceCorrectionsProps) {
  const [balance, setBalance] = useState<JobInvoiceBalance | null>(null);
  const [corrections, setCorrections] = useState<InvoiceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [addLineForId, setAddLineForId] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<InvoiceLineDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [balanceResult, adjustmentsResult] = await Promise.all([
        getOfficeJobInvoiceBalance({ jobId, apiBaseUrl, sessionToken }),
        listOfficeJobAdjustments({ jobId, apiBaseUrl, sessionToken })
      ]);
      setBalance(balanceResult);
      setCorrections(adjustmentsResult.adjustments);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load corrections.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshBalance() {
    try {
      setBalance(await getOfficeJobInvoiceBalance({ jobId, apiBaseUrl, sessionToken }));
    } catch {
      // A stale balance is non-fatal; the next full load corrects it.
    }
  }

  // Replace one correction in the list with the server's updated copy.
  function applyCorrection(next: InvoiceSummary, notice: string) {
    setCorrections((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists
        ? current.map((item) => (item.id === next.id ? next : item))
        : [...current, next];
    });
    setNoticeMessage(notice);
    setErrorMessage(null);
  }

  async function createCorrection(kind: InvoiceAdjustmentKind) {
    setIsSaving(true);
    try {
      const response = await createOfficeJobAdjustment({ jobId, kind, apiBaseUrl, sessionToken });
      applyCorrection(response.invoice, `${correctionKindLabels[kind]} started.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to create the ${kind}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveLine(invoiceId: string) {
    if (!lineDraft) return;
    const parsed = parseInvoiceLineDraft(lineDraft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setIsSaving(true);
    try {
      const response = await addOfficeInvoiceLineById({
        invoiceId,
        apiBaseUrl,
        sessionToken,
        ...parsed.value
      });
      applyCorrection(response.invoice, 'Line added.');
      setAddLineForId(null);
      setLineDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLine(line: InvoiceLineItemSummary) {
    if (!window.confirm(`Remove "${line.description}" from this correction?`)) return;
    setIsSaving(true);
    try {
      const response = await voidOfficeInvoiceLine({ lineId: line.id, apiBaseUrl, sessionToken });
      applyCorrection(response.invoice, 'Line removed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to remove the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function postCorrection(correction: InvoiceSummary) {
    const label =
      correctionKindLabels[
        correction.invoiceKind === 'credit' ? 'credit' : 'adjustment'
      ].toLowerCase();
    if (
      !window.confirm(
        `Post this ${label}? Once posted it becomes part of the locked accounting record and can no longer be edited.`
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await postOfficeInvoiceById({
        invoiceId: correction.id,
        apiBaseUrl,
        sessionToken
      });
      applyCorrection(
        response.invoice,
        `${
          correctionKindLabels[correction.invoiceKind === 'credit' ? 'credit' : 'adjustment']
        } posted.`
      );
      void refreshBalance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to post the ${label}.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section style={styles.panel} aria-label="Invoice corrections and balance">
      <div style={styles.row}>
        <h2 style={styles.heading}>Corrections &amp; balance</h2>
        {canCreate ? (
          <div style={styles.badgeRow}>
            <button
              type="button"
              style={styles.button}
              disabled={isSaving}
              onClick={() => void createCorrection('adjustment')}
            >
              Add adjustment
            </button>
            <button
              type="button"
              style={styles.button}
              disabled={isSaving}
              onClick={() => void createCorrection('credit')}
            >
              Add credit
            </button>
          </div>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      {balance ? (
        <div style={styles.subpanel}>
          <SummaryRow label="Posted invoice" value={formatCurrency(balance.postedMainTotal)} />
          {balance.postedAdjustmentsTotal > 0 ? (
            <SummaryRow
              label="Adjustments"
              value={`+${formatCurrency(balance.postedAdjustmentsTotal)}`}
            />
          ) : null}
          {balance.postedCreditsTotal > 0 ? (
            <SummaryRow label="Credits" value={`−${formatCurrency(balance.postedCreditsTotal)}`} />
          ) : null}
          <SummaryRow label="Net billed" value={formatCurrency(balance.netBilled)} emphasize />
        </div>
      ) : null}

      {isLoading ? (
        <p style={styles.muted}>Loading corrections…</p>
      ) : corrections.length === 0 ? (
        <p style={styles.muted}>
          No corrections yet. Use an adjustment to add a charge or a credit to reduce what&apos;s
          owed.
        </p>
      ) : (
        <div style={styles.list}>
          {corrections.map((correction) => (
            <CorrectionCard
              key={correction.id}
              correction={correction}
              canEdit={canEdit}
              canPost={canPost}
              isSaving={isSaving}
              isAddingLine={addLineForId === correction.id}
              lineDraft={lineDraft}
              onStartAddLine={() => {
                setAddLineForId(correction.id);
                setLineDraft(createEmptyInvoiceLineDraft());
              }}
              onCancelAddLine={() => {
                setAddLineForId(null);
                setLineDraft(null);
              }}
              onChangeLineDraft={setLineDraft}
              onSaveLine={() => void saveLine(correction.id)}
              onRemoveLine={(line) => void removeLine(line)}
              onPost={() => void postCorrection(correction)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CorrectionCard({
  correction,
  canEdit,
  canPost,
  isSaving,
  isAddingLine,
  lineDraft,
  onStartAddLine,
  onCancelAddLine,
  onChangeLineDraft,
  onSaveLine,
  onRemoveLine,
  onPost
}: {
  correction: InvoiceSummary;
  canEdit: boolean;
  canPost: boolean;
  isSaving: boolean;
  isAddingLine: boolean;
  lineDraft: InvoiceLineDraft | null;
  onStartAddLine: () => void;
  onCancelAddLine: () => void;
  onChangeLineDraft: (draft: InvoiceLineDraft) => void;
  onSaveLine: () => void;
  onRemoveLine: (line: InvoiceLineItemSummary) => void;
  onPost: () => void;
}) {
  const isDraft = correction.status === 'draft';
  const kindLabel =
    correctionKindLabels[correction.invoiceKind === 'credit' ? 'credit' : 'adjustment'];

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <strong>{kindLabel}</strong>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>{isDraft ? 'Draft' : 'Posted'}</span>
          {isDraft && canEdit && !isAddingLine ? (
            <button type="button" style={styles.button} onClick={onStartAddLine}>
              Add line
            </button>
          ) : null}
          {isDraft && canPost && !isAddingLine && correction.lineItems.length > 0 ? (
            <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onPost}>
              Post {kindLabel.toLowerCase()}
            </button>
          ) : null}
        </div>
      </div>

      {correction.lineItems.length === 0 ? (
        <p style={styles.tinyMuted}>No lines yet.</p>
      ) : (
        correction.lineItems.map((line) => (
          <div key={line.id} style={styles.row}>
            <div style={{ minWidth: 0 }}>
              <span>{line.description}</span>
              <p style={styles.tinyMuted}>
                {invoiceLineKindLabels[line.kind]} · {invoiceSourceLabels[line.sourceKind]} ·{' '}
                {line.quantity}
                {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''} ×{' '}
                {formatCurrency(line.unitPrice)}
                {line.taxable ? '' : ' · non-taxable'}
              </p>
            </div>
            <div style={styles.badgeRow}>
              <strong>{formatCurrency(line.lineSubtotal)}</strong>
              {isDraft && canEdit ? (
                <button
                  type="button"
                  style={styles.dangerButton}
                  onClick={() => onRemoveLine(line)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))
      )}

      {isAddingLine && lineDraft ? (
        <InvoiceLineEditor
          heading={`New ${kindLabel.toLowerCase()} line`}
          draft={lineDraft}
          isSaving={isSaving}
          onChange={onChangeLineDraft}
          onSave={onSaveLine}
          onCancel={onCancelAddLine}
        />
      ) : null}

      <InvoiceTotals invoice={correction} />
      {correction.posted ? <PostedInvoiceSummary posted={correction.posted} /> : null}
    </div>
  );
}
