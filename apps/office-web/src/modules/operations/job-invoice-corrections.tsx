'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  requestOfficeOnlineRefund,
  voidOfficeInvoiceLine,
  voidOfficePayment,
  type InvoiceAdjustmentKind,
  type InvoiceLineItemSummary,
  type InvoiceSummary,
  type JobInvoiceBalance,
  type OnlinePaymentLinkResponse,
  type OnlineRefundRequestSummary,
  type Payment,
  type PaymentRefund
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency, SummaryRow, type InvoicePaymentPermissions } from './job-invoice-shared';
import {
  emptyPaymentDraft,
  PaymentsBlock,
  type PaymentLinkDraft,
  type PaymentDraft,
  type RefundDraft
} from './job-invoice-payments-block';
import {
  buildPaymentTargetOptions,
  defaultPaymentLinkAmountForTarget,
  findPaymentTarget,
  type PaymentTargetOption
} from './job-invoice-payment-targets';
import {
  buildInvoiceLineDraft,
  createEmptyInvoiceLineDraft,
  parseInvoiceLineDraft,
  type InvoiceLineDraft
} from './job-invoice-types';
import { CorrectionCard, correctionKindLabels } from './job-invoice-correction-card';

const stalePaymentTargetMessage =
  'The selected invoice is no longer available. Start the payment again.';

type JobInvoiceCorrectionsProps = {
  jobId: string;
  mainInvoiceId: string;
  mainInvoiceNumber?: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
  canPost: boolean;
  canCreate: boolean;
  paymentPermissions: InvoicePaymentPermissions;
};

// The job-level money rollup, shown once the main invoice is posted: the net billed
// balance and amount due, the adjustment/credit records (each its own draft→posted
// invoice), and the payment ledger. Reuses the same line editor and money formatting
// as the main draft. Adjustments add a charge; credits reduce what's owed; payments
// reduce the amount due without ever changing invoice totals.
export function JobInvoiceCorrections({
  jobId,
  mainInvoiceId,
  mainInvoiceNumber,
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
  const [onlineRefundRequests, setOnlineRefundRequests] = useState<OnlineRefundRequestSummary[]>(
    []
  );
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
  const [paymentLinkDraft, setPaymentLinkDraft] = useState<PaymentLinkDraft | null>(null);
  const [refundDraft, setRefundDraft] = useState<RefundDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false);
  const [onlinePaymentLink, setOnlinePaymentLink] = useState<Extract<
    OnlinePaymentLinkResponse,
    { state: 'created' }
  > | null>(null);

  const canViewPayments = paymentPermissions.canView;
  const paymentTargets = useMemo(
    () =>
      balance
        ? buildPaymentTargetOptions({
            mainInvoiceId,
            mainInvoiceNumber,
            balance,
            corrections,
            payments,
            refunds
          })
        : [
            {
              invoiceId: mainInvoiceId,
              label: mainInvoiceNumber ?? 'Main invoice',
              remainingAmount: 0
            }
          ],
    [balance, corrections, mainInvoiceId, mainInvoiceNumber, payments, refunds]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [balanceResult, adjustmentsResult, paymentsResult] = await Promise.all([
        getOfficeJobInvoiceBalance({ jobId, apiBaseUrl, sessionToken }),
        listOfficeJobAdjustments({ jobId, apiBaseUrl, sessionToken }),
        canViewPayments
          ? listOfficeJobPayments({ jobId, apiBaseUrl, sessionToken })
          : Promise.resolve({ payments: [], refunds: [], onlineRefundRequests: [] })
      ]);
      setBalance(balanceResult);
      setCorrections(adjustmentsResult.adjustments);
      setPayments(paymentsResult.payments);
      setRefunds(paymentsResult.refunds);
      setOnlineRefundRequests(paymentsResult.onlineRefundRequests);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load corrections.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, canViewPayments, jobId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stalePaymentDraft =
      paymentDraft !== null && findPaymentTarget(paymentTargets, paymentDraft.invoiceId) === null;
    const stalePaymentLinkDraft =
      paymentLinkDraft !== null &&
      findPaymentTarget(paymentTargets, paymentLinkDraft.invoiceId) === null;
    if (!stalePaymentDraft && !stalePaymentLinkDraft) {
      return;
    }
    if (stalePaymentDraft) {
      setPaymentDraft(null);
    }
    if (stalePaymentLinkDraft) {
      setPaymentLinkDraft(null);
    }
    setErrorMessage(stalePaymentTargetMessage);
  }, [paymentDraft, paymentLinkDraft, paymentTargets]);

  // While an accepted online refund awaits worker confirmation, poll so the pending
  // row becomes the confirmed refund without a manual reload (smooth demo/smoke).
  const hasPendingOnlineRefund = onlineRefundRequests.some(
    (request) => request.status === 'requested' && request.submissionState === 'submitted'
  );
  useEffect(() => {
    if (!hasPendingOnlineRefund) {
      return;
    }
    const interval = setInterval(() => {
      void load();
    }, 10_000);
    return () => clearInterval(interval);
  }, [hasPendingOnlineRefund, load]);

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
    const target = findPaymentTarget(paymentTargets, paymentDraft.invoiceId);
    if (!target) {
      setPaymentDraft(null);
      setErrorMessage(stalePaymentTargetMessage);
      return;
    }
    const amountCents = Math.round(amount * 100);
    const amountDueCents = Math.max(Math.round((balance?.amountDue ?? 0) * 100), 0);
    if (amountCents > amountDueCents) {
      const extraCents = amountCents - amountDueCents;
      const confirmed = window.confirm(
        `Record a ${formatCurrency(amount)} payment when this job only has ${formatCurrency(
          amountDueCents / 100
        )} due?\n\nThe extra ${formatCurrency(extraCents / 100)} will be held as job credit.`
      );
      if (!confirmed) {
        return;
      }
    }
    setIsSaving(true);
    try {
      const response = await recordOfficePayment({
        invoiceId: target.invoiceId,
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

  function startPaymentLink() {
    if (!balance || balance.amountDue <= 0) {
      setErrorMessage('This job does not have an outstanding balance.');
      return;
    }
    setPaymentDraft(null);
    setRefundDraft(null);
    const target = getDefaultPaymentTarget(paymentTargets, mainInvoiceId);
    setPaymentLinkDraft({
      invoiceId: target.invoiceId,
      amount: defaultPaymentLinkAmountForTarget(target, balance.amountDue)
    });
    setErrorMessage(null);
  }

  async function createPaymentLink() {
    if (!paymentLinkDraft) return;
    const target = findPaymentTarget(paymentTargets, paymentLinkDraft.invoiceId);
    if (!target) {
      setPaymentLinkDraft(null);
      setErrorMessage(stalePaymentTargetMessage);
      return;
    }
    const targetInvoiceId = target.invoiceId;
    if (!balance || balance.amountDue <= 0) {
      setErrorMessage('This job does not have an outstanding balance.');
      return;
    }
    const requestedAmount = Number(paymentLinkDraft.amount);
    const requestedAmountCents = Math.round(requestedAmount * 100);
    if (
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0 ||
      Math.abs(requestedAmount * 100 - requestedAmountCents) > 0.000001
    ) {
      setErrorMessage('Enter a payment link amount greater than zero in dollars and cents.');
      return;
    }
    const amountDueCents = Math.round(balance.amountDue * 100);
    if (requestedAmountCents > amountDueCents) {
      setErrorMessage(
        `Payment link amount cannot exceed the ${formatCurrency(balance.amountDue)} currently due.`
      );
      return;
    }
    const amount = requestedAmountCents / 100;
    setIsCreatingPaymentLink(true);
    try {
      const confirmations = {
        confirmSameAmountCharge: false,
        confirmActiveLinkOverage: false
      };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await requestPaymentLink(confirmations, amount, targetInvoiceId);
        if (response.state === 'confirmationRequired') {
          if (response.code === 'sameAmountPreviouslyPaid') {
            const confirmed = window.confirm(
              `Create another ${formatCurrency(response.amount)} payment link?\n\n${response.message}`
            );
            if (!confirmed) {
              return;
            }
            confirmations.confirmSameAmountCharge = true;
            continue;
          }
          if (response.code === 'activeLinksMayExceedDue') {
            const confirmed = window.confirm(
              `${response.message}\n\nCreate this ${formatCurrency(
                response.amount
              )} payment link anyway?`
            );
            if (!confirmed) {
              return;
            }
            confirmations.confirmActiveLinkOverage = true;
            continue;
          }
          setErrorMessage(response.message ?? 'Online payment links are not available right now.');
          return;
        }
        if (response.state !== 'created') {
          setErrorMessage(response.message ?? 'Online payment links are not available right now.');
          return;
        }
        setOnlinePaymentLink(response);
        setPaymentLinkDraft(null);
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
        return;
      }
      setErrorMessage('Online payment link confirmation could not be completed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create payment link.');
    } finally {
      setIsCreatingPaymentLink(false);
    }
  }

  function requestPaymentLink(
    confirmations: {
      confirmSameAmountCharge: boolean;
      confirmActiveLinkOverage: boolean;
    },
    amount: number,
    targetInvoiceId: string
  ) {
    return createOfficeOnlinePaymentLink({
      invoiceId: targetInvoiceId,
      amount,
      confirmSameAmountCharge: confirmations.confirmSameAmountCharge || undefined,
      ...(confirmations.confirmActiveLinkOverage ? { confirmActiveLinkOverage: true } : {}),
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
    if (refundDraft.kind === 'online') {
      await saveOnlineRefund(refundDraft.paymentId, amount, refundDraft.reason);
      return;
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

  // Online refunds open a PENDING request the relay sends to the processor and the
  // worker confirms later, so reload to pick up the new pending row (and the
  // confirmed refund once it lands) rather than optimistically inserting one.
  async function saveOnlineRefund(paymentId: string, amount: number, reason: string) {
    setIsSaving(true);
    try {
      const response = await requestOfficeOnlineRefund({
        paymentId,
        amount,
        reason: reason.trim() || undefined,
        apiBaseUrl,
        sessionToken
      });
      setRefundDraft(null);
      // Refresh FIRST (load() clears the notice/error), then set the final message so
      // it survives — and the new pending/failed row is reflected either way.
      await load();
      if (response.state === 'requested') {
        setNoticeMessage('Online refund requested. It will confirm once the processor settles it.');
        setErrorMessage(null);
      } else {
        setNoticeMessage(null);
        // The API returns office-safe copy for failed/providerError/paymentsNotConfigured.
        setErrorMessage(response.message ?? 'The online refund could not be requested.');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to request the online refund.'
      );
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
          onlineRefundRequests={onlineRefundRequests}
          canRecord={paymentPermissions.canRecord}
          canVoid={paymentPermissions.canVoid}
          canRefund={paymentPermissions.canRefund}
          isSaving={isSaving}
          isCreatingPaymentLink={isCreatingPaymentLink}
          amountDue={balance?.amountDue ?? 0}
          onlinePaymentLink={onlinePaymentLink}
          paymentLinkDraft={paymentLinkDraft}
          paymentDraft={paymentDraft}
          paymentTargets={paymentTargets}
          refundDraft={refundDraft}
          onStartRecord={() => {
            setPaymentLinkDraft(null);
            setPaymentDraft(
              emptyPaymentDraft(getDefaultPaymentTarget(paymentTargets, mainInvoiceId).invoiceId)
            );
          }}
          onStartPaymentLink={startPaymentLink}
          onCancelPaymentLink={() => setPaymentLinkDraft(null)}
          onChangePaymentLinkDraft={setPaymentLinkDraft}
          onCreatePaymentLink={() => void createPaymentLink()}
          onCancelRecord={() => setPaymentDraft(null)}
          onChangeDraft={setPaymentDraft}
          onSavePayment={() => void savePayment()}
          onVoidPayment={(payment) => void voidPayment(payment)}
          onStartRefund={(payment, remaining) =>
            setRefundDraft({
              paymentId: payment.id,
              amount: remaining,
              reason: '',
              kind: payment.source === 'bellfieldPayments' ? 'online' : 'manual'
            })
          }
          onRetryOnlineRefund={(payment, amount) => void saveOnlineRefund(payment.id, amount, '')}
          onCancelRefund={() => setRefundDraft(null)}
          onChangeRefundDraft={setRefundDraft}
          onSaveRefund={() => void saveRefund()}
        />
      ) : null}
    </section>
  );
}

function getDefaultPaymentTarget(
  paymentTargets: PaymentTargetOption[],
  mainInvoiceId: string
): PaymentTargetOption {
  return (
    findPaymentTarget(paymentTargets, mainInvoiceId) ??
    paymentTargets[0] ?? {
      invoiceId: mainInvoiceId,
      label: 'Main invoice',
      remainingAmount: 0
    }
  );
}
