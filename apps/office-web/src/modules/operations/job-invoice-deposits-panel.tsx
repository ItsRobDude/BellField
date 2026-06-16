'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createOfficeDepositPaymentLink,
  recordOfficeJobDeposit,
  getOfficeJobInvoiceBalance,
  listOfficeJobPayments,
  type JobInvoiceBalance,
  type OnlinePaymentLinkResponse,
  type Payment,
  type PaymentMethod,
  type PaymentRefund
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency, SummaryRow } from './job-invoice-shared';

type DepositDraft = {
  amount: string;
};

// A manually recorded deposit (cash/check/card the office took directly), mirroring
// the manual payment form. Method is HOW it was paid; the purpose is always deposit.
type ManualDepositDraft = {
  amount: string;
  method: PaymentMethod;
  reference: string;
  memo: string;
};

const depositMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  card: 'Card',
  ach: 'ACH',
  other: 'Other'
};
const depositMethodOptions: PaymentMethod[] = ['cash', 'check', 'card', 'ach', 'other'];

type DraftInvoiceDepositsPanelProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  billToCustomerEmail?: string;
  canCreate: boolean;
};

export function DraftInvoiceDepositsPanel({
  jobId,
  apiBaseUrl,
  sessionToken,
  billToCustomerEmail,
  canCreate
}: DraftInvoiceDepositsPanelProps) {
  const [balance, setBalance] = useState<JobInvoiceBalance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<PaymentRefund[]>([]);
  const [depositDraft, setDepositDraft] = useState<DepositDraft | null>(null);
  const [manualDepositDraft, setManualDepositDraft] = useState<ManualDepositDraft | null>(null);
  const [depositLink, setDepositLink] = useState<Extract<
    OnlinePaymentLinkResponse,
    { state: 'created' }
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [balanceResult, paymentsResult] = await Promise.all([
        getOfficeJobInvoiceBalance({ jobId, apiBaseUrl, sessionToken }),
        listOfficeJobPayments({ jobId, apiBaseUrl, sessionToken })
      ]);
      setBalance(balanceResult);
      setPayments(paymentsResult.payments);
      setRefunds(paymentsResult.refunds);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load deposits.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDepositLink() {
    if (!depositDraft) return;
    const amount = Number(depositDraft.amount);
    const amountCents = Math.round(amount * 100);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - amountCents) > 0.000001
    ) {
      setErrorMessage('Enter a deposit amount greater than zero in dollars and cents.');
      return;
    }
    const normalizedAmount = amountCents / 100;
    setIsCreating(true);
    setErrorMessage(null);
    try {
      const confirmations = {
        confirmSameAmountCharge: false
      };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await requestDepositLink(normalizedAmount, confirmations);
        if (response.state === 'confirmationRequired') {
          if (response.code === 'sameAmountPreviouslyPaid') {
            const confirmed = window.confirm(
              `Create another ${formatCurrency(response.amount)} deposit link?\n\n${response.message}`
            );
            if (!confirmed) {
              return;
            }
            confirmations.confirmSameAmountCharge = true;
            continue;
          }
          setErrorMessage(response.message ?? 'Deposit links are not available right now.');
          return;
        }
        if (response.state !== 'created') {
          setErrorMessage(response.message ?? 'Deposit links are not available right now.');
          return;
        }
        setDepositLink(response);
        setDepositDraft(null);
        let copied = false;
        try {
          await navigator.clipboard?.writeText(response.checkoutUrl);
          copied = true;
        } catch {
          copied = false;
        }
        setNoticeMessage(
          response.reusedExisting
            ? copied
              ? 'Existing active deposit link copied.'
              : 'Existing active deposit link shown.'
            : copied
              ? 'Deposit link copied.'
              : 'Deposit link created.'
        );
        return;
      }
      setErrorMessage('Deposit link confirmation could not be completed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create deposit link.');
    } finally {
      setIsCreating(false);
    }
  }

  async function saveManualDeposit() {
    if (!manualDepositDraft) return;
    const amount = Number(manualDepositDraft.amount);
    const amountCents = Math.round(amount * 100);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - amountCents) > 0.000001
    ) {
      setErrorMessage('Enter a deposit amount greater than zero in dollars and cents.');
      return;
    }
    setIsRecording(true);
    setErrorMessage(null);
    try {
      await recordOfficeJobDeposit({
        jobId,
        amount: amountCents / 100,
        method: manualDepositDraft.method,
        reference: manualDepositDraft.reference.trim() || undefined,
        memo: manualDepositDraft.memo.trim() || undefined,
        apiBaseUrl,
        sessionToken
      });
      setManualDepositDraft(null);
      setNoticeMessage('Deposit recorded.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to record the deposit.');
    } finally {
      setIsRecording(false);
    }
  }

  function patchManualDeposit(values: Partial<ManualDepositDraft>) {
    setManualDepositDraft((current) => (current ? { ...current, ...values } : current));
  }

  function requestDepositLink(
    amount: number,
    confirmations: {
      confirmSameAmountCharge: boolean;
    }
  ) {
    return createOfficeDepositPaymentLink({
      jobId,
      amount,
      customerEmail: billToCustomerEmail,
      confirmSameAmountCharge: confirmations.confirmSameAmountCharge || undefined,
      apiBaseUrl,
      sessionToken
    });
  }

  const creditRows = getUnallocatedCredits(payments, refunds);

  return (
    <div style={styles.subpanel} aria-label="Deposits and job credit">
      <div style={styles.row}>
        <h3 style={styles.sectionHeading}>Deposits</h3>
        {canCreate && !depositDraft && !manualDepositDraft ? (
          <div style={styles.badgeRow}>
            <button
              type="button"
              style={styles.button}
              disabled={isCreating || isRecording}
              onClick={() => {
                setManualDepositDraft({ amount: '', method: 'check', reference: '', memo: '' });
                setDepositLink(null);
                setErrorMessage(null);
                setNoticeMessage(null);
              }}
            >
              Record deposit
            </button>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isCreating || isRecording}
              onClick={() => {
                setDepositDraft({ amount: '' });
                setDepositLink(null);
                setErrorMessage(null);
                setNoticeMessage(null);
              }}
            >
              Create deposit link
            </button>
          </div>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      {isLoading ? (
        <p style={styles.muted}>Loading deposits...</p>
      ) : balance ? (
        <div style={styles.subpanel}>
          {balance.paidTotal > 0 ? (
            <SummaryRow
              label="Deposits and payments"
              value={`-${formatCurrency(balance.paidTotal)}`}
            />
          ) : null}
          {balance.refundedTotal > 0 ? (
            <SummaryRow label="Refunded" value={`+${formatCurrency(balance.refundedTotal)}`} />
          ) : null}
          {balance.amountDue < 0 ? (
            <SummaryRow
              label="Job credit"
              value={formatCurrency(Math.abs(balance.amountDue))}
              emphasize
            />
          ) : (
            <SummaryRow label="Amount due" value={formatCurrency(balance.amountDue)} emphasize />
          )}
        </div>
      ) : null}

      {depositLink ? (
        <div style={styles.drawerPanel}>
          <label style={styles.fieldLabel}>
            <span>Deposit link</span>
            <input style={styles.input} value={depositLink.checkoutUrl} readOnly />
          </label>
          <p style={styles.tinyMuted}>
            {formatCurrency(depositLink.amount)} - expires {depositLink.expiresAt.slice(0, 10)}
          </p>
        </div>
      ) : null}

      {depositDraft ? (
        <div style={styles.drawerPanel}>
          <label style={styles.fieldLabel}>
            <span>Deposit amount</span>
            <input
              style={styles.input}
              type="number"
              step="0.01"
              aria-label="Deposit amount"
              value={depositDraft.amount}
              onChange={(event) => setDepositDraft({ amount: event.target.value })}
            />
          </label>
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isCreating}
              onClick={() => void createDepositLink()}
            >
              {isCreating ? 'Creating...' : 'Create deposit link'}
            </button>
            <button
              type="button"
              style={styles.button}
              disabled={isCreating}
              onClick={() => setDepositDraft(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {manualDepositDraft ? (
        <div style={styles.drawerPanel}>
          <div style={styles.formGridCompact}>
            <label style={styles.fieldLabel}>
              <span>Deposit amount</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                aria-label="Manual deposit amount"
                value={manualDepositDraft.amount}
                onChange={(event) => patchManualDeposit({ amount: event.target.value })}
              />
            </label>
            <label style={styles.fieldLabel}>
              <span>Method</span>
              <select
                style={styles.input}
                aria-label="Deposit method"
                value={manualDepositDraft.method}
                onChange={(event) =>
                  patchManualDeposit({ method: event.target.value as PaymentMethod })
                }
              >
                {depositMethodOptions.map((method) => (
                  <option key={method} value={method}>
                    {depositMethodLabels[method]}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.fieldLabel}>
              <span>Reference</span>
              <input
                style={styles.input}
                aria-label="Deposit reference"
                value={manualDepositDraft.reference}
                onChange={(event) => patchManualDeposit({ reference: event.target.value })}
              />
            </label>
            <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
              <span>Memo</span>
              <input
                style={styles.input}
                aria-label="Deposit memo"
                value={manualDepositDraft.memo}
                onChange={(event) => patchManualDeposit({ memo: event.target.value })}
              />
            </label>
          </div>
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isRecording}
              onClick={() => void saveManualDeposit()}
            >
              {isRecording ? 'Recording...' : 'Record deposit'}
            </button>
            <button
              type="button"
              style={styles.button}
              disabled={isRecording}
              onClick={() => setManualDepositDraft(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {creditRows.length === 0 ? (
        <p style={styles.tinyMuted}>No deposits collected yet.</p>
      ) : (
        creditRows.map((row) => (
          <p key={row.payment.id} style={styles.tinyMuted}>
            {formatCurrency(row.amount)} - {paymentLabel(row.payment)} - unallocated credit
          </p>
        ))
      )}
    </div>
  );
}

function getUnallocatedCredits(
  payments: Payment[],
  refunds: PaymentRefund[]
): Array<{ payment: Payment; amount: number }> {
  const refundedByPayment = new Map<string, number>();
  for (const refund of refunds) {
    refundedByPayment.set(
      refund.paymentId,
      (refundedByPayment.get(refund.paymentId) ?? 0) + refund.amount
    );
  }
  return payments
    .filter((payment) => !payment.isVoid)
    .map((payment) => {
      const allocated = payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      const refunded = refundedByPayment.get(payment.id) ?? 0;
      return { payment, amount: Math.max(payment.amount - allocated - refunded, 0) };
    })
    .filter((row) => row.amount > 0);
}

// Purpose-aware, matching the main ledger: a held deposit reads "Deposit received
// · Online card", an unallocated overpayment "Payment received · Check".
function paymentLabel(payment: Payment): string {
  const purposeLabel = payment.purpose === 'deposit' ? 'Deposit received' : 'Payment received';
  const methodLabel =
    payment.source === 'bellfieldPayments'
      ? 'Online card'
      : payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
  return `${purposeLabel} · ${methodLabel}`;
}
