'use client';

import type { CSSProperties } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import type { DispatchScheduleDraft } from './dispatch-schedule-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type DispatchSchedulePopoverProps = {
  card: DispatchAppointmentCard;
  draft: DispatchScheduleDraft;
  errorMessage: string | null;
  isSaving: boolean;
  technicians: DispatchBoardResponse['technicians'];
  onCancel: () => void;
  onChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onSave: () => void;
};

export function DispatchSchedulePopover({
  card,
  draft,
  errorMessage,
  isSaving,
  technicians,
  onCancel,
  onChange,
  onSave
}: DispatchSchedulePopoverProps) {
  return (
    <div
      role="dialog"
      aria-label={`Edit schedule for job ${card.jobNumber}`}
      style={dispatchSchedulePopoverStyle}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={styles.row}>
        <strong>Schedule</strong>
        <span style={styles.tinyMuted}>Job {card.jobNumber}</span>
      </div>
      <div style={dispatchScheduleFormGridStyle}>
        <label style={fieldLabelStyle}>
          <span>Date</span>
          <input
            aria-label="Dispatch appointment date"
            type="date"
            value={draft.scheduledDate}
            onChange={(event) =>
              onChange({
                scheduledDate: event.target.value,
                ...(event.target.value ? {} : { scheduledStartTime: '', scheduledEndTime: '' })
              })
            }
            style={styles.input}
          />
        </label>
        <label style={fieldLabelStyle}>
          <span>Start</span>
          <input
            aria-label="Dispatch appointment start time"
            type="text"
            placeholder="HH:MM"
            pattern="[0-2][0-9]:[0-5][0-9]"
            title="Use 24-hour HH:MM, for example 13:45."
            value={draft.scheduledStartTime}
            disabled={!draft.scheduledDate}
            onChange={(event) => onChange({ scheduledStartTime: event.target.value })}
            style={styles.input}
          />
        </label>
        <label style={fieldLabelStyle}>
          <span>End</span>
          <input
            aria-label="Dispatch appointment end time"
            type="text"
            placeholder="HH:MM"
            pattern="[0-2][0-9]:[0-5][0-9]"
            title="Use 24-hour HH:MM, for example 15:45."
            value={draft.scheduledEndTime}
            disabled={!draft.scheduledDate}
            onChange={(event) => onChange({ scheduledEndTime: event.target.value })}
            style={styles.input}
          />
        </label>
        <label style={fieldLabelStyle}>
          <span>Window</span>
          <input
            aria-label="Dispatch appointment time window"
            value={draft.timeWindowLabel}
            onChange={(event) => onChange({ timeWindowLabel: event.target.value })}
            style={styles.input}
          />
        </label>
        <label style={{ ...fieldLabelStyle, ...dispatchScheduleFullWidthStyle }}>
          <span>Technician</span>
          <select
            aria-label="Dispatch appointment technician"
            value={draft.technicianId}
            onChange={(event) => onChange({ technicianId: event.target.value })}
            style={styles.input}
          >
            <option value="">Unassigned</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {errorMessage ? <p style={dispatchScheduleErrorStyle}>{errorMessage}</p> : null}
      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onSave}>
          {isSaving ? 'Saving...' : 'Save schedule'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const dispatchSchedulePopoverStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd8d6',
  borderRadius: 8,
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
  display: 'grid',
  gap: '0.75rem',
  left: 0,
  padding: '0.85rem',
  position: 'absolute',
  top: 'calc(100% + 0.4rem)',
  width: '24rem',
  zIndex: 20
};

const dispatchScheduleFormGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.6rem',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
};

const dispatchScheduleFullWidthStyle: CSSProperties = {
  gridColumn: '1 / -1'
};

const dispatchScheduleErrorStyle: CSSProperties = {
  color: '#b42318',
  fontSize: '0.85rem',
  fontWeight: 700,
  margin: 0
};

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.8rem',
  fontWeight: 700
};
