'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  getOfficeJobCosting,
  postOfficeJobExpense,
  postOfficeJobLabor,
  reverseOfficeJobCostEvent,
  type JobCostingSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';

export type JobCostSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  // True when the job is completed/closed/cancelled: cost writes are blocked until reopened
  // (the backend enforces this; the UI disables the actions and explains why).
  jobIsFinal: boolean;
};

type ActiveForm =
  | { kind: 'labor'; description: string; hours: string; ratePerHour: string }
  | { kind: 'expense'; description: string; amount: string }
  | { kind: 'reverse'; eventId: string; reason: string };

// Job cost tab: the live rollup (material/labor/expense), the finalized snapshot frozen at
// completion, and the labor/expense/material event ledger with reversal corrections. Stock material detail
// lives on the Inventory surface's movements (filtered by job). Styling reuses
// officeWorkspaceStyles; gated on jobCosting:view (tab) / create / edit.
export function JobCostSection({
  jobId,
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit,
  jobIsFinal
}: JobCostSectionProps) {
  const [costing, setCosting] = useState<JobCostingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await getOfficeJobCosting({ apiBaseUrl, sessionToken, jobId });
      setCosting(result.costing);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load job cost.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function afterWrite(message: string) {
    setNoticeMessage(message);
    setActiveForm(null);
    await load();
  }

  async function submit() {
    if (!activeForm) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      if (activeForm.kind === 'labor') {
        await postOfficeJobLabor({
          apiBaseUrl,
          sessionToken,
          jobId,
          body: {
            description: activeForm.description.trim(),
            hours: Number(activeForm.hours),
            ratePerHour: Number(activeForm.ratePerHour)
          }
        });
        await afterWrite('Labor cost added.');
      } else if (activeForm.kind === 'expense') {
        await postOfficeJobExpense({
          apiBaseUrl,
          sessionToken,
          jobId,
          body: { description: activeForm.description.trim(), amount: Number(activeForm.amount) }
        });
        await afterWrite('Expense added.');
      } else {
        await reverseOfficeJobCostEvent({
          apiBaseUrl,
          sessionToken,
          jobId,
          eventId: activeForm.eventId,
          body: { reason: activeForm.reason.trim() || undefined }
        });
        await afterWrite('Cost event reversed.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !costing) {
    return <p style={styles.muted}>Loading job cost…</p>;
  }
  if (!costing) {
    return errorMessage ? <p style={styles.error}>{errorMessage}</p> : null;
  }

  const events = costing.events;
  const reversedIds = new Set(
    events.map((event) => event.reversalOfEventId).filter((id): id is string => Boolean(id))
  );
  const formOpen = activeForm !== null;

  return (
    <div style={styles.list}>
      <div style={styles.row}>
        <h2 style={styles.heading}>Job cost</h2>
        <div style={styles.inlineActionBar}>
          {canCreate && !jobIsFinal ? (
            <>
              <button
                type="button"
                style={styles.button}
                disabled={isSaving || formOpen}
                onClick={() =>
                  setActiveForm({ kind: 'labor', description: '', hours: '', ratePerHour: '' })
                }
              >
                Add labor
              </button>
              <button
                type="button"
                style={styles.button}
                disabled={isSaving || formOpen}
                onClick={() => setActiveForm({ kind: 'expense', description: '', amount: '' })}
              >
                Add expense
              </button>
            </>
          ) : null}
          <button
            type="button"
            style={styles.button}
            disabled={isLoading}
            onClick={() => void load()}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}
      {jobIsFinal ? (
        <p style={styles.tinyMuted}>
          This job is finalized. Reopen it to change job cost (labor, expense, or reversals).
        </p>
      ) : null}

      <div style={styles.panel}>
        <h3 style={styles.sectionHeading}>Live cost</h3>
        <div style={styles.detailGrid}>
          <CostField label="Material" value={costing.live.materialCost} />
          <CostField label="Labor" value={costing.live.laborCost} />
          <CostField label="Expense" value={costing.live.expenseCost} />
          <CostField
            label={costing.live.costComplete ? 'Total' : 'Known total'}
            value={costing.live.totalCost}
            emphasize
          />
        </div>
        {!costing.live.costComplete ? (
          <p style={styles.error}>
            {costing.live.unresolvedLineCount} register line
            {costing.live.unresolvedLineCount === 1 ? '' : 's'} still need cost resolution — this
            total is not final and margin is not reliable until they are resolved.
          </p>
        ) : null}
        {costing.finalized ? (
          <p style={styles.tinyMuted}>
            <span style={styles.badge}>Finalized</span> Frozen at completion:{' '}
            {formatCurrency(costing.finalized.totalCost)}
            {costing.finalized.totalCost !== costing.live.totalCost
              ? ' (live cost has changed since)'
              : ''}
          </p>
        ) : (
          <p style={styles.tinyMuted}>
            Not finalized — the snapshot is frozen when the job completes.
          </p>
        )}
      </div>

      {activeForm ? (
        <CostForm
          form={activeForm}
          isSaving={isSaving}
          onChange={setActiveForm}
          onCancel={() => setActiveForm(null)}
          onSubmit={() => void submit()}
        />
      ) : null}

      <div style={styles.panel}>
        <div style={styles.row}>
          <h3 style={styles.sectionHeading}>Cost events</h3>
          <span style={styles.badge}>{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p style={styles.muted}>No labor, material, or expense costs recorded yet.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['When', 'Type', 'Description', 'Amount', 'By', ''].map((label, index) => (
                    <th key={label || `col-${index}`} style={styles.tableHeadCell}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const isReversal = Boolean(event.reversalOfEventId);
                  const reversible =
                    canEdit && !jobIsFinal && !isReversal && !reversedIds.has(event.id);
                  return (
                    <tr key={event.id}>
                      <td style={styles.tableCell}>{event.occurredAt.slice(0, 10)}</td>
                      <td style={styles.tableCell}>
                        {eventKindLabel(event.kind)}
                        {isReversal ? ' (reversal)' : ''}
                      </td>
                      <td style={styles.tableCell}>
                        {event.description}
                        {event.kind === 'labor' &&
                        event.hours !== undefined &&
                        event.ratePerHour !== undefined ? (
                          <p style={styles.tinyMuted}>
                            {event.hours} h × {formatCurrency(event.ratePerHour)}
                          </p>
                        ) : null}
                      </td>
                      <td style={styles.tableCell}>{formatCurrency(event.amount)}</td>
                      <td style={styles.tableCell}>{event.actorName}</td>
                      <td style={styles.tableCell}>
                        {reversible ? (
                          <button
                            type="button"
                            style={styles.tableLinkButton}
                            disabled={isSaving || formOpen}
                            onClick={() =>
                              setActiveForm({ kind: 'reverse', eventId: event.id, reason: '' })
                            }
                          >
                            Reverse
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CostForm({
  form,
  isSaving,
  onChange,
  onCancel,
  onSubmit
}: {
  form: ActiveForm;
  isSaving: boolean;
  onChange: (form: ActiveForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit =
    form.kind === 'labor'
      ? Boolean(form.description.trim()) &&
        isPositiveNumber(form.hours) &&
        isNonNegativeNumber(form.ratePerHour)
      : form.kind === 'expense'
        ? Boolean(form.description.trim()) && isPositiveNumber(form.amount)
        : true;
  const title =
    form.kind === 'labor' ? 'Add labor' : form.kind === 'expense' ? 'Add expense' : 'Reverse event';

  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h3 style={styles.sectionHeading}>{title}</h3>
      <div style={styles.formGridCompact}>
        {form.kind === 'labor' ? (
          <>
            <Field
              label="Description"
              value={form.description}
              onChange={(description) => onChange({ ...form, description })}
            />
            <Field
              label="Hours"
              value={form.hours}
              onChange={(hours) => onChange({ ...form, hours })}
            />
            <Field
              label="Rate per hour"
              value={form.ratePerHour}
              onChange={(ratePerHour) => onChange({ ...form, ratePerHour })}
            />
          </>
        ) : null}
        {form.kind === 'expense' ? (
          <>
            <Field
              label="Description"
              value={form.description}
              onChange={(description) => onChange({ ...form, description })}
            />
            <Field
              label="Amount"
              value={form.amount}
              onChange={(amount) => onChange({ ...form, amount })}
            />
          </>
        ) : null}
        {form.kind === 'reverse' ? (
          <Field
            label="Reason (optional)"
            value={form.reason}
            onChange={(reason) => onChange({ ...form, reason })}
          />
        ) : null}
      </div>
      <div style={styles.inlineActionBar}>
        <button type="submit" style={styles.primaryButton} disabled={isSaving || !canSubmit}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function eventKindLabel(kind: 'labor' | 'expense' | 'material'): string {
  if (kind === 'labor') return 'Labor';
  if (kind === 'material') return 'Material';
  return 'Expense';
}

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isNonNegativeNumber(value: string): boolean {
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
}

function CostField({
  label,
  value,
  emphasize
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p style={styles.fieldText}>{label}</p>
      <div>{emphasize ? <strong>{formatCurrency(value)}</strong> : formatCurrency(value)}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <input
        style={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
