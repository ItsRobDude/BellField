'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addOfficeInvoiceLineById,
  createOfficeJobAdjustment,
  createOfficeOnlinePaymentLink,
  editOfficeInvoiceLine,
  getOfficeJobInvoiceBalance,
  listOfficeJobAdjustments,
  listOfficeJobPayments,
  postOfficeInvoiceById,
  recordOfficePayment,
  refundOfficePayment,
  voidOfficeInvoiceLine,
  voidOfficePayment,
  type InvoiceAdjustmentKind,
  type InvoiceLineItemSummary,
  type InvoiceSummary,
  type JobInvoiceBalance,
  type OnlinePaymentLinkResponse,
  type Payment,
  type PaymentRefund
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  formatCurrency,
  InvoiceLineEditor,
  InvoiceTotals,
  invoiceSourceLabels,
  PostedInvoiceSummary,
  SummaryRow,
  type InvoicePaymentPermissions
} from './job-invoice-shared';
import {
  emptyPaymentDraft,
  PaymentsBlock,
  type PaymentDraft,
  type RefundDraft
} from './job-invoice-payments-block';
import {
  buildInvoiceLineDraft,
  createEmptyInvoiceLineDraft,
  invoiceLineKindLabels,
  parseInvoiceLineDraft,
  type InvoiceLineDraft
} from './job-invoice-types';

type JobInvoiceCorrectionsProps = {
  jobId: string;
  mainInvoiceId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
  canPost: boolean;
  canCreate: boolean;
  paymentPermissions: InvoicePaymentPermissions;
};

const correctionKindLabels: Record<InvoiceAdjustmentKind, string> = {
  adjustment: 'Adjustment',
  credit: 'Credit'
};

// The job-level money rollup, shown once the main invoice is posted: the net billed
// balance and amount due, the adjustment/credit records (each its own draft→posted
// invoice), and the payment ledger. Reuses the same line editor and money formatting
// as the main draft. Adjustments add a charge; credits reduce what's owed; payments
// reduce the amount due without ever changing invoice totals.
export function JobInvoiceCorrections({
  jobId,
  mainInvoiceId,
  apiBaseUrl,
  sessionToken,
  canEdit,
  canPost,
  canCreate,
  paymentPermissions
}: JobInvoiceCorrectionsProps) {
  const [balance, setBalance] = useState<JobInvoiceBalance | null>(null);
  const [corrections, setCorrections] = useState<InvoiceSummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<PaymentRefund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  // A single in-flight line editor across all correction cards. lineId null means a new
  // line (add); a lineId means editing that line.
  const [lineEdit, setLineEdit] = useState<{
    invoiceId: string;
    lineId: string | null;
    draft: InvoiceLineDraft;
  } | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [refundDraft, setRefundDraft] = useState<RefundDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false);
  const [onlinePaymentLink, setOnlinePaymentLink] = useState<Extract<
    OnlinePaymentLinkResponse,
    { state: 'created' }
  > | null>(null);

  const canViewPayments = paymentPermissions.canView;

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [balanceResult, adjustmentsResult, paymentsResult] = await Promise.all([
        getOfficeJobInvoiceBalance({ jobId, apiBaseUrl, sessionToken }),
        listOfficeJobAdjustments({ jobId, apiBaseUrl, sessionToken }),
        canViewPayments
          ? listOfficeJobPayments({ jobId, apiBaseUrl, sessionToken })
          : Promise.resolve({ payments: [], refunds: [] })
      ]);
      setBalance(balanceResult);
      setCorrections(adjustmentsResult.adjustments);
      setPayments(paymentsResult.payments);
      setRefunds(paymentsResult.refunds);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load corrections.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, canViewPayments, jobId, sessionToken]);

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

  function applyCorrection(next: InvoiceSummary, notice: string) {
    setCorrections((current) => {
      const exists = current.some((item) => item.id === next.id);
      // Newest first: a freshly created correction goes to the top.
      return exists
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current];
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

  async function saveLineEdit() {
    if (!lineEdit) return;
    const parsed = parseInvoiceLineDraft(lineEdit.draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setIsSaving(true);
    try {
      const response = lineEdit.lineId
        ? await editOfficeInvoiceLine({
            lineId: lineEdit.lineId,
            apiBaseUrl,
            sessionToken,
            ...parsed.value
          })
        : await addOfficeInvoiceLineById({
            invoiceId: lineEdit.invoiceId,
            apiBaseUrl,
            sessionToken,
            ...parsed.value
          });
      applyCorrection(response.invoice, lineEdit.lineId ? 'Line updated.' : 'Line added.');
      setLineEdit(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the line.');
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
        `${label.charAt(0).toUpperCase()}${label.slice(1)} posted.`
      );
      void refreshBalance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to post the ${label}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function savePayment() {
    if (!paymentDraft) return;
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Enter a payment amount greater than zero.');
      return;
    }
    setIsSaving(true);
    try {
      const response = await recordOfficePayment({
        invoiceId: mainInvoiceId,
        amount,
        method: paymentDraft.method,
        reference: paymentDraft.reference.trim() || undefined,
        memo: paymentDraft.memo.trim() || undefined,
        apiBaseUrl,
        sessionToken
      });
      setPayments((current) => [response.payment, ...current]);
      setPaymentDraft(null);
      setNoticeMessage('Payment recorded.');
      setErrorMessage(null);
      void refreshBalance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to record the payment.');
    } finally {
      setIsSaving(false);
    }
  }

  async function createPaymentLink() {
    if (!balance || balance.amountDue <= 0) {
      setErrorMessage('This job does not have an outstanding balance.');
      return;
    }
    setIsCreatingPaymentLink(true);
    try {
      let response = await requestPaymentLink(false);
      if (response.state === 'confirmationRequired') {
        const confirmed = window.confirm(
          `Create another ${formatCurrency(response.amount)} payment link?\n\n${response.message}`
        );
        if (!confirmed) {
          return;
        }
        response = await requestPaymentLink(true);
      }
      if (response.state !== 'created') {
        setErrorMessage(response.message ?? 'Online payment links are not available right now.');
        return;
      }
      setOnlinePaymentLink(response);
      setErrorMessage(null);
      let copied = false;
      try {
        await navigator.clipboard?.writeText(response.checkoutUrl);
        copied = true;
      } catch {
        copied = false;
      }
      if (response.reusedExisting) {
        setNoticeMessage(
          copied ? 'Existing active payment link copied.' : 'Existing active payment link shown.'
        );
      } else {
        setNoticeMessage(copied ? 'Payment link copied.' : 'Payment link created.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create payment link.');
    } finally {
      setIsCreatingPaymentLink(false);
    }
  }

  function requestPaymentLink(confirmSameAmountCharge: boolean) {
    return createOfficeOnlinePaymentLink({
      invoiceId: mainInvoiceId,
      confirmSameAmountCharge: confirmSameAmountCharge || undefined,
      apiBaseUrl,
      sessionToken
    });
  }

  async function voidPayment(payment: Payment) {
    // Voiding a payment is a money-ledger correction; capture an optional reason
    // for the audit trail. A null return means the user cancelled.
    const reason = window.prompt(
      `Void this ${formatCurrency(payment.amount)} payment? Optionally note a reason:`,
      ''
    );
    if (reason === null) return;
    setIsSaving(true);
    try {
      const response = await voidOfficePayment({
        paymentId: payment.id,
        reason: reason.trim() || undefined,
        apiBaseUrl,
        sessionToken
      });
      setPayments((current) =>
        current.map((item) => (item.id === response.payment.id ? response.payment : item))
      );
      setNoticeMessage('Payment voided.');
      setErrorMessage(null);
      void refreshBalance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to void the payment.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveRefund() {
    if (!refundDraft) return;
    const amount = Number(refundDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Enter a refund amount greater than zero.');
      return;
    }
    // Client-side guard mirroring the backend over-refund rule, so the operator
    // gets immediate feedback instead of a round-trip rejection.
    const payment = payments.find((item) => item.id === refundDraft.paymentId);
    if (payment) {
      const refundedCents = refunds
        .filter((refund) => refund.paymentId === payment.id)
        .reduce((sum, refund) => sum + Math.round(refund.amount * 100), 0);
      const refundableCents = Math.round(payment.amount * 100) - refundedCents;
      if (Math.round(amount * 100) > refundableCents) {
        setErrorMessage(
          `Refund cannot exceed the ${formatCurrency(refundableCents / 100)} still refundable.`
        );
        return;
      }
    }
    setIsSaving(true);
    try {
      const response = await refundOfficePayment({
        paymentId: refundDraft.paymentId,
        amount,
        reason: refundDraft.reason.trim() || undefined,
        apiBaseUrl,
        sessionToken
      });
      setRefunds((current) => [response.refund, ...current]);
      setRefundDraft(null);
      setNoticeMessage('Refund recorded.');
      setErrorMessage(null);
      void refreshBalance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to record the refund.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section style={styles.panel} aria-label="Invoice corrections, balance, and payments">
      <div style={styles.row}>
        <h2 style={styles.heading}>Corrections &amp; balance</h2>
        {canCreate ? (
          <div style={styles.badgeRow}>
            <button
              type="button"
              style={styles.button}
              disabled={isSaving || lineEdit !== null}
              onClick={() => void createCorrection('adjustment')}
            >
              Add adjustment
            </button>
            <button
              type="button"
              style={styles.button}
              disabled={isSaving || lineEdit !== null}
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
          <SummaryRow label="Net billed" value={formatCurrency(balance.netBilled)} />
          {canViewPayments ? (
            <>
              {balance.paidTotal > 0 ? (
                <SummaryRow label="Paid" value={`−${formatCurrency(balance.paidTotal)}`} />
              ) : null}
              {balance.refundedTotal > 0 ? (
                <SummaryRow label="Refunded" value={`+${formatCurrency(balance.refundedTotal)}`} />
              ) : null}
              <SummaryRow label="Amount due" value={formatCurrency(balance.amountDue)} emphasize />
            </>
          ) : null}
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
              lineEdit={lineEdit?.invoiceId === correction.id ? lineEdit : null}
              otherEditInProgress={lineEdit !== null && lineEdit.invoiceId !== correction.id}
              onStartAddLine={() =>
                setLineEdit({
                  invoiceId: correction.id,
                  lineId: null,
                  draft: createEmptyInvoiceLineDraft()
                })
              }
              onStartEditLine={(line) =>
                setLineEdit({
                  invoiceId: correction.id,
                  lineId: line.id,
                  draft: buildInvoiceLineDraft(line)
                })
              }
              onCancelLineEdit={() => setLineEdit(null)}
              onChangeLineDraft={(draft) =>
                setLineEdit((current) => (current ? { ...current, draft } : current))
              }
              onSaveLine={() => void saveLineEdit()}
              onRemoveLine={(line) => void removeLine(line)}
              onPost={() => void postCorrection(correction)}
            />
          ))}
        </div>
      )}

      {canViewPayments ? (
        <PaymentsBlock
          payments={payments}
          refunds={refunds}
          canRecord={paymentPermissions.canRecord}
          canVoid={paymentPermissions.canVoid}
          canRefund={paymentPermissions.canRefund}
          isSaving={isSaving}
          isCreatingPaymentLink={isCreatingPaymentLink}
          amountDue={balance?.amountDue ?? 0}
          onlinePaymentLink={onlinePaymentLink}
          paymentDraft={paymentDraft}
          refundDraft={refundDraft}
          onStartRecord={() => setPaymentDraft(emptyPaymentDraft())}
          onCreatePaymentLink={() => void createPaymentLink()}
          onCancelRecord={() => setPaymentDraft(null)}
          onChangeDraft={setPaymentDraft}
          onSavePayment={() => void savePayment()}
          onVoidPayment={(payment) => void voidPayment(payment)}
          onStartRefund={(payment, remaining) =>
            setRefundDraft({ paymentId: payment.id, amount: remaining, reason: '' })
          }
          onCancelRefund={() => setRefundDraft(null)}
          onChangeRefundDraft={setRefundDraft}
          onSaveRefund={() => void saveRefund()}
        />
      ) : null}
    </section>
  );
}

function CorrectionCard({
  correction,
  canEdit,
  canPost,
  isSaving,
  lineEdit,
  otherEditInProgress,
  onStartAddLine,
  onStartEditLine,
  onCancelLineEdit,
  onChangeLineDraft,
  onSaveLine,
  onRemoveLine,
  onPost
}: {
  correction: InvoiceSummary;
  canEdit: boolean;
  canPost: boolean;
  isSaving: boolean;
  lineEdit: { invoiceId: string; lineId: string | null; draft: InvoiceLineDraft } | null;
  otherEditInProgress: boolean;
  onStartAddLine: () => void;
  onStartEditLine: (line: InvoiceLineItemSummary) => void;
  onCancelLineEdit: () => void;
  onChangeLineDraft: (draft: InvoiceLineDraft) => void;
  onSaveLine: () => void;
  onRemoveLine: (line: InvoiceLineItemSummary) => void;
  onPost: () => void;
}) {
  const isDraft = correction.status === 'draft';
  const kindLabel =
    correctionKindLabels[correction.invoiceKind === 'credit' ? 'credit' : 'adjustment'];
  const isAddingLine = lineEdit !== null && lineEdit.lineId === null;
  const editingLineId = lineEdit?.lineId ?? null;
  const isBusyEditing = lineEdit !== null;
  // While a line is being edited on ANOTHER card, suppress this card's actions so a
  // stray click can't discard that unsaved edit (one editor is open at a time).
  const actionsEnabled = isDraft && canEdit && !isBusyEditing && !otherEditInProgress;

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <strong>{kindLabel}</strong>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>{isDraft ? 'Draft' : 'Posted'}</span>
          {actionsEnabled ? (
            <button type="button" style={styles.button} onClick={onStartAddLine}>
              Add line
            </button>
          ) : null}
          {isDraft &&
          canPost &&
          !isBusyEditing &&
          !otherEditInProgress &&
          correction.lineItems.length > 0 ? (
            <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onPost}>
              Post {kindLabel.toLowerCase()}
            </button>
          ) : null}
        </div>
      </div>

      {correction.lineItems.length === 0 ? (
        <p style={styles.tinyMuted}>No lines yet.</p>
      ) : (
        correction.lineItems.map((line) =>
          editingLineId === line.id && lineEdit ? (
            <InvoiceLineEditor
              key={line.id}
              heading={`Edit: ${line.description}`}
              draft={lineEdit.draft}
              isSaving={isSaving}
              onChange={onChangeLineDraft}
              onSave={onSaveLine}
              onCancel={onCancelLineEdit}
            />
          ) : (
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
                {actionsEnabled ? (
                  <>
                    <button
                      type="button"
                      style={styles.button}
                      onClick={() => onStartEditLine(line)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={styles.dangerButton}
                      onClick={() => onRemoveLine(line)}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )
        )
      )}

      {isAddingLine && lineEdit ? (
        <InvoiceLineEditor
          heading={`New ${kindLabel.toLowerCase()} line`}
          draft={lineEdit.draft}
          isSaving={isSaving}
          onChange={onChangeLineDraft}
          onSave={onSaveLine}
          onCancel={onCancelLineEdit}
        />
      ) : null}

      <InvoiceTotals invoice={correction} />
      {correction.posted ? <PostedInvoiceSummary posted={correction.posted} /> : null}
    </div>
  );
}
