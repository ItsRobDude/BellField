'use client';

import type { CSSProperties } from 'react';
import type { JobSummary, RegisterEntryKind, RegisterEntrySummary } from '@/lib/operations-api';
import { formatCurrency, formatDateTime, formatQuantity } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { useAsyncAction } from '@/components/use-async-action';
import { formatAppointmentReference } from './job-detail-format';
import type { CapturedWorkDetails, RegisterEntryEditDraft } from './job-work-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobRegisterEntriesSectionProps = {
  job: JobSummary;
  capturedWork?: CapturedWorkDetails;
  editingRegisterEntryId: string | null;
  onEditRegisterEntry: (entryId: string | null) => void;
  onRegisterDraftChange: (
    jobId: string,
    registerEntryId: string,
    draft: RegisterEntryEditDraft
  ) => void;
  onSaveRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onRegisterVoidReasonChange: (jobId: string, registerEntryId: string, reason: string) => void;
  onVoidRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
};

const registerKindLabels: Record<RegisterEntryKind, string> = {
  labor: 'Labor',
  serviceItem: 'Service item',
  part: 'Part',
  membership: 'Agreement',
  other: 'Other'
};

export function JobRegisterEntriesSection({
  job,
  capturedWork,
  editingRegisterEntryId,
  onEditRegisterEntry,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry
}: JobRegisterEntriesSectionProps) {
  if (!capturedWork || capturedWork.isLoading) {
    return <p style={styles.muted}>Loading captured work...</p>;
  }

  if (capturedWork.registerEntries.length === 0) {
    return <p style={styles.muted}>No register entries.</p>;
  }

  return (
    <div style={styles.list}>
      {capturedWork.registerEntries.map((entry) => (
        <RegisterEntryCard
          key={entry.id}
          job={job}
          entry={entry}
          draft={capturedWork.registerDrafts[entry.id]}
          isEditing={editingRegisterEntryId === entry.id}
          voidReason={capturedWork.registerVoidReasons[entry.id] ?? ''}
          onEditRegisterEntry={onEditRegisterEntry}
          onRegisterDraftChange={onRegisterDraftChange}
          onSaveRegisterEntry={onSaveRegisterEntry}
          onRegisterVoidReasonChange={onRegisterVoidReasonChange}
          onVoidRegisterEntry={onVoidRegisterEntry}
        />
      ))}
    </div>
  );
}

function RegisterEntryCard({
  job,
  entry,
  draft,
  isEditing,
  voidReason,
  onEditRegisterEntry,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry
}: {
  job: JobSummary;
  entry: RegisterEntrySummary;
  draft: RegisterEntryEditDraft | undefined;
  isEditing: boolean;
  voidReason: string;
  onEditRegisterEntry: (entryId: string | null) => void;
  onRegisterDraftChange: JobRegisterEntriesSectionProps['onRegisterDraftChange'];
  onSaveRegisterEntry: JobRegisterEntriesSectionProps['onSaveRegisterEntry'];
  onRegisterVoidReasonChange: JobRegisterEntriesSectionProps['onRegisterVoidReasonChange'];
  onVoidRegisterEntry: JobRegisterEntriesSectionProps['onVoidRegisterEntry'];
}) {
  const saveEntry = useAsyncAction(() => onSaveRegisterEntry(job.id, entry.id));
  const activeDraft = draft ?? {
    appointmentId: entry.appointmentId ?? '',
    kind: entry.kind,
    description: entry.description,
    quantity: String(entry.quantity),
    unitOfMeasure: entry.unitOfMeasure ?? '',
    unitPrice: entry.unitPrice === undefined ? '' : String(entry.unitPrice),
    totalAmount: String(entry.totalAmount),
    partNumber: entry.partNumber ?? '',
    inventorySourceLabel: entry.inventorySourceLabel ?? ''
  };

  return (
    <section style={entry.isVoid ? styles.mutedPanel : styles.panel}>
      <div style={styles.row}>
        <div>
          <strong>{entry.description}</strong>
          <p style={styles.tinyMuted}>
            {registerKindLabels[entry.kind]} - {formatQuantity(entry.quantity, entry.unitOfMeasure)}{' '}
            - {formatCurrency(entry.totalAmount)}
          </p>
        </div>
        <div style={styles.badgeRow}>
          {entry.isVoid ? <span style={styles.dangerBadge}>Voided</span> : null}
          <span style={styles.badge}>{entry.capturedByName}</span>
          {!entry.isVoid ? (
            <button
              type="button"
              style={styles.button}
              onClick={() => onEditRegisterEntry(isEditing ? null : entry.id)}
            >
              {isEditing ? 'Close' : 'Edit'}
            </button>
          ) : null}
        </div>
      </div>
      <p style={styles.tinyMuted}>
        {formatDateTime(entry.capturedAt)}
        {entry.appointmentId ? ` - ${formatAppointmentReference(job, entry.appointmentId)}` : ''}
      </p>
      {entry.inventorySourceLabel || entry.partNumber || entry.catalogSnapshot?.name ? (
        <p style={styles.tinyMuted}>
          {[entry.catalogSnapshot?.name, entry.partNumber, entry.inventorySourceLabel]
            .filter(Boolean)
            .join(' - ')}
        </p>
      ) : null}
      {entry.isVoid ? (
        <p style={styles.tinyMuted}>
          {entry.voidReason ? `Void reason: ${entry.voidReason}` : 'Voided.'}
        </p>
      ) : isEditing ? (
        <>
          <div style={styles.formGridCompact}>
            <label style={fieldLabelStyle}>
              <span>Kind</span>
              <select
                aria-label={`Register kind for ${entry.description}`}
                value={activeDraft.kind}
                onChange={(event) =>
                  onRegisterDraftChange(job.id, entry.id, {
                    ...activeDraft,
                    kind: event.target.value as RegisterEntryKind
                  })
                }
                style={styles.input}
              >
                {Object.entries(registerKindLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Description"
              ariaLabel={`Register description for ${entry.description}`}
              value={activeDraft.description}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, description: value })
              }
            />
            <TextField
              label="Qty"
              ariaLabel={`Register quantity for ${entry.description}`}
              value={activeDraft.quantity}
              type="number"
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, quantity: value })
              }
            />
            <TextField
              label="Unit"
              ariaLabel={`Register unit for ${entry.description}`}
              value={activeDraft.unitOfMeasure}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, unitOfMeasure: value })
              }
            />
            <TextField
              label="Unit price"
              ariaLabel={`Register unit price for ${entry.description}`}
              value={activeDraft.unitPrice}
              type="number"
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, unitPrice: value })
              }
            />
            <TextField
              label="Total"
              ariaLabel={`Register total for ${entry.description}`}
              value={activeDraft.totalAmount}
              type="number"
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, totalAmount: value })
              }
            />
            <TextField
              label="Part"
              ariaLabel={`Register part number for ${entry.description}`}
              value={activeDraft.partNumber}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, partNumber: value })
              }
            />
            <TextField
              label="Source"
              ariaLabel={`Register source for ${entry.description}`}
              value={activeDraft.inventorySourceLabel}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, {
                  ...activeDraft,
                  inventorySourceLabel: value
                })
              }
            />
            <label style={fieldLabelStyle}>
              <span>Appointment</span>
              <select
                aria-label={`Register appointment for ${entry.description}`}
                value={activeDraft.appointmentId}
                onChange={(event) =>
                  onRegisterDraftChange(job.id, entry.id, {
                    ...activeDraft,
                    appointmentId: event.target.value
                  })
                }
                style={styles.input}
              >
                <option value="">None</option>
                {job.appointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {formatAppointmentReference(job, appointment.id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={styles.inlineActionBar}>
            <SubmitButton
              variant="secondary"
              isBusy={saveEntry.isBusy}
              onClick={() => void saveEntry.run()}
            >
              Save
            </SubmitButton>
            <input
              aria-label={`Void reason for ${entry.description}`}
              value={voidReason}
              onChange={(event) => onRegisterVoidReasonChange(job.id, entry.id, event.target.value)}
              placeholder="Void reason"
              style={styles.input}
            />
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => void onVoidRegisterEntry(job.id, entry.id)}
            >
              Void
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function TextField({
  label,
  ariaLabel,
  value,
  type = 'text',
  onChange
}: {
  label: string;
  ariaLabel: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        value={value}
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  );
}

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.85rem',
  fontWeight: 700
};
