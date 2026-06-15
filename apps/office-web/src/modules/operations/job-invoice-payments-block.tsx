'use client';

import type {
  OnlinePaymentLinkResponse,
  Payment,
  PaymentMethod,
  PaymentRefund
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  card: 'Card',
  ach: 'ACH',
  other: 'Other'
};

const paymentMethodOptions: PaymentMethod[] = ['cash', 'check', 'card', 'ach', 'other'];

export type PaymentDraft = {
  amount: string;
  method: PaymentMethod;
  reference: string;
  memo: string;
};
export type RefundDraft = { paymentId: string; amount: string; reason: string };

export function emptyPaymentDraft(): PaymentDraft {
  return { amount: '', method: 'card', reference: '', memo: '' };
}

// The job's payment ledger: record manual payments / online links, void or refund
// a payment, and show refunds linked to the payment they reverse. Lives on its own
// so the corrections container stays under the source-size guardrail.
export function PaymentsBlock({
  payments,
  refunds,
  canRecord,
  canVoid,
  canRefund,
  isSaving,
  isCreatingPaymentLink,
  amountDue,
  onlinePaymentLink,
  paymentDraft,
  refundDraft,
  onStartRecord,
  onCreatePaymentLink,
  onCancelRecord,
  onChangeDraft,
  onSavePayment,
  onVoidPayment,
  onStartRefund,
  onCancelRefund,
  onChangeRefundDraft,
  onSaveRefund
}: {
  payments: Payment[];
  refunds: PaymentRefund[];
  canRecord: boolean;
  canVoid: boolean;
  canRefund: boolean;
  isSaving: boolean;
  isCreatingPaymentLink: boolean;
  amountDue: number;
  onlinePaymentLink: Extract<OnlinePaymentLinkResponse, { state: 'created' }> | null;
  paymentDraft: PaymentDraft | null;
  refundDraft: RefundDraft | null;
  onStartRecord: () => void;
  onCreatePaymentLink: () => void;
  onCancelRecord: () => void;
  onChangeDraft: (draft: PaymentDraft) => void;
  onSavePayment: () => void;
  onVoidPayment: (payment: Payment) => void;
  onStartRefund: (payment: Payment, remaining: string) => void;
  onCancelRefund: () => void;
  onChangeRefundDraft: (draft: RefundDraft) => void;
  onSaveRefund: () => void;
}) {
  function patch(values: Partial<PaymentDraft>) {
    if (paymentDraft) {
      onChangeDraft({ ...paymentDraft, ...values });
    }
  }
  // Refunds keyed by the payment they reverse, so each payment row can show its
  // refunds and compute how much is still refundable (in whole cents).
  const refundsByPayment = new Map<string, PaymentRefund[]>();
  for (const refund of refunds) {
    refundsByPayment.set(refund.paymentId, [
      ...(refundsByPayment.get(refund.paymentId) ?? []),
      refund
    ]);
  }

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <h3 style={styles.sectionHeading}>Payments</h3>
        {canRecord && !paymentDraft ? (
          <div style={styles.badgeRow}>
            {amountDue > 0 ? (
              <button
                type="button"
                style={styles.primaryButton}
                disabled={isSaving || isCreatingPaymentLink}
                onClick={onCreatePaymentLink}
              >
                {isCreatingPaymentLink ? 'Creating…' : 'Create payment link'}
              </button>
            ) : null}
            <button type="button" style={styles.button} disabled={isSaving} onClick={onStartRecord}>
              Record payment
            </button>
          </div>
        ) : null}
      </div>

      {onlinePaymentLink ? (
        <div style={styles.drawerPanel}>
          <label style={styles.fieldLabel}>
            <span>Payment link</span>
            <input style={styles.input} value={onlinePaymentLink.checkoutUrl} readOnly />
          </label>
          <p style={styles.tinyMuted}>
            {formatCurrency(onlinePaymentLink.amount)} · expires{' '}
            {onlinePaymentLink.expiresAt.slice(0, 10)}
          </p>
        </div>
      ) : null}

      {paymentDraft ? (
        <div style={styles.drawerPanel}>
          <div style={styles.formGridCompact}>
            <label style={styles.fieldLabel}>
              <span>Amount</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={paymentDraft.amount}
                onChange={(event) => patch({ amount: event.target.value })}
              />
            </label>
            <label style={styles.fieldLabel}>
              <span>Method</span>
              <select
                style={styles.input}
                value={paymentDraft.method}
                onChange={(event) => patch({ method: event.target.value as PaymentMethod })}
              >
                {paymentMethodOptions.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.fieldLabel}>
              <span>Reference</span>
              <input
                style={styles.input}
                value={paymentDraft.reference}
                onChange={(event) => patch({ reference: event.target.value })}
              />
            </label>
            <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
              <span>Memo</span>
              <input
                style={styles.input}
                value={paymentDraft.memo}
                onChange={(event) => patch({ memo: event.target.value })}
              />
            </label>
          </div>
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isSaving}
              onClick={onSavePayment}
            >
              {isSaving ? 'Saving…' : 'Record payment'}
            </button>
            <button
              type="button"
              style={styles.button}
              disabled={isSaving}
              onClick={onCancelRecord}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {payments.length === 0 ? (
        <p style={styles.tinyMuted}>No payments recorded yet.</p>
      ) : (
        payments.map((payment) => {
          const paymentRefunds = refundsByPayment.get(payment.id) ?? [];
          const amountCents = Math.round(payment.amount * 100);
          const refundedCents = paymentRefunds.reduce(
            (sum, refund) => sum + Math.round(refund.amount * 100),
            0
          );
          const refundableCents = amountCents - refundedCents;
          const isRefunding = refundDraft?.paymentId === payment.id;
          return (
            <div key={payment.id} style={{ display: 'grid', gap: '0.25rem' }}>
              <div style={styles.row}>
                <div style={{ minWidth: 0 }}>
                  <span style={payment.isVoid ? { textDecoration: 'line-through' } : undefined}>
                    {formatCurrency(payment.amount)} · {paymentLabel(payment)}
                  </span>
                  <p style={styles.tinyMuted}>
                    {payment.receivedAt.slice(0, 10)}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                    {payment.isVoid
                      ? ` · void${payment.voidedByName ? ` by ${payment.voidedByName}` : ''}`
                      : ''}
                    {!payment.isVoid && refundedCents > 0
                      ? ` · ${formatCurrency(refundedCents / 100)} refunded`
                      : ''}
                  </p>
                </div>
                <div style={styles.badgeRow}>
                  {canRefund &&
                  !payment.isVoid &&
                  payment.source === 'manual' &&
                  refundableCents > 0 &&
                  !isRefunding ? (
                    <button
                      type="button"
                      style={styles.button}
                      disabled={isSaving}
                      onClick={() => onStartRefund(payment, (refundableCents / 100).toFixed(2))}
                    >
                      Refund
                    </button>
                  ) : null}
                  {/* Void is hidden once a refund exists: the backend rejects it (it would
                      drop the payment from the paid total while the refund still counts). */}
                  {canVoid &&
                  !payment.isVoid &&
                  payment.source === 'manual' &&
                  refundedCents === 0 ? (
                    <button
                      type="button"
                      style={styles.dangerButton}
                      disabled={isSaving}
                      onClick={() => onVoidPayment(payment)}
                    >
                      Void
                    </button>
                  ) : null}
                </div>
              </div>

              {paymentRefunds.map((refund) => (
                <p key={refund.id} style={styles.tinyMuted}>
                  ↳ {formatCurrency(refund.amount)} refunded {refund.refundedAt.slice(0, 10)}
                  {refund.reason ? ` · ${refund.reason}` : ''}
                </p>
              ))}

              {isRefunding && refundDraft ? (
                <div style={styles.drawerPanel}>
                  <div style={styles.formGridCompact}>
                    <label style={styles.fieldLabel}>
                      <span>Refund amount</span>
                      <input
                        style={styles.input}
                        type="number"
                        step="0.01"
                        aria-label="Refund amount"
                        value={refundDraft.amount}
                        onChange={(event) =>
                          onChangeRefundDraft({ ...refundDraft, amount: event.target.value })
                        }
                      />
                    </label>
                    <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
                      <span>Reason</span>
                      <input
                        style={styles.input}
                        aria-label="Refund reason"
                        value={refundDraft.reason}
                        onChange={(event) =>
                          onChangeRefundDraft({ ...refundDraft, reason: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <p style={styles.tinyMuted}>
                    Up to {formatCurrency(refundableCents / 100)} refundable.
                  </p>
                  <div style={styles.inlineActionBar}>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      disabled={isSaving}
                      onClick={onSaveRefund}
                    >
                      {isSaving ? 'Saving…' : 'Record refund'}
                    </button>
                    <button
                      type="button"
                      style={styles.button}
                      disabled={isSaving}
                      onClick={onCancelRefund}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function paymentLabel(payment: Payment): string {
  if (payment.source === 'bellfieldPayments') {
    return 'Online card';
  }
  return paymentMethodLabels[payment.method];
}
