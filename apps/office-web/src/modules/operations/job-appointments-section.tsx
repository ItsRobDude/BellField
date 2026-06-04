'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { AppointmentStatus, JobSummary, JobsWorkspaceResponse } from '@/lib/operations-api';
import { formatAppointmentScheduleTime } from './appointment-schedule-format';
import {
  appointmentStatusLabels,
  appointmentStatusOptions,
  createAppointmentDraft,
  createEmptyAppointmentDraft,
  type AppointmentDraft,
  type AppointmentEditDraft
} from './job-work-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobAppointmentsSectionProps = {
  job: JobSummary;
  technicians: JobsWorkspaceResponse['technicians'];
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  focusedAppointmentId?: string | null;
  onAppointmentStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  onAppointmentDraftChange: (jobId: string, patch: Partial<AppointmentDraft>) => void;
  onAppointmentEditDraftChange: (
    appointmentId: string,
    baseDraft: AppointmentEditDraft,
    patch: Partial<AppointmentEditDraft>
  ) => void;
  onSaveAppointmentSchedule: (appointmentId: string) => Promise<void>;
  onAddAppointment: (jobId: string) => Promise<void>;
};

export function JobAppointmentsSection({
  job,
  technicians,
  appointmentDrafts,
  appointmentEditDrafts,
  focusedAppointmentId,
  onAppointmentStatusChange,
  onAppointmentDraftChange,
  onAppointmentEditDraftChange,
  onSaveAppointmentSchedule,
  onAddAppointment
}: JobAppointmentsSectionProps) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const canAddAppointment = job.status !== 'closed' && job.status !== 'cancelled';
  const draft = appointmentDrafts[job.id] ?? createEmptyAppointmentDraft();

  useEffect(() => {
    setIsAddFormOpen(false);
  }, [job.id]);

  async function handleAddAppointment() {
    await onAddAppointment(job.id);
    setIsAddFormOpen(false);
  }

  return (
    <div style={styles.list}>
      {job.appointments.length === 0 ? <p style={styles.muted}>No appointments.</p> : null}
      {job.appointments.map((appointment) => {
        const editDraft =
          appointmentEditDrafts[appointment.id] ?? createAppointmentDraft(appointment);
        const isFocused = focusedAppointmentId === appointment.id;

        return (
          <section
            key={appointment.id}
            style={isFocused ? { ...styles.panel, borderColor: '#1c6b57' } : styles.panel}
            aria-label={`Appointment ${appointment.id}`}
          >
            <div style={styles.row}>
              <div>
                <strong>{appointment.scheduledDate ?? 'Unscheduled'}</strong>
                <p style={styles.tinyMuted}>
                  {formatAppointmentScheduleTime(appointment)} -{' '}
                  {appointment.technicianName ?? 'Unassigned'}
                </p>
              </div>
              <div style={styles.badgeRow}>
                <span style={styles.badge}>{appointmentStatusLabels[appointment.status]}</span>
                {appointment.needsOfficeReview ? (
                  <span style={styles.dangerBadge}>Review</span>
                ) : null}
              </div>
            </div>
            {appointment.finishOutcome ? (
              <p style={styles.tinyMuted}>
                Outcome: {formatFinishOutcome(appointment.finishOutcome)}
              </p>
            ) : null}
            {appointment.visitNotes ? (
              <p style={styles.tinyMuted}>Notes: {appointment.visitNotes}</p>
            ) : null}
            {appointment.registerFollowUpNote ? (
              <p style={styles.tinyMuted}>Follow-up: {appointment.registerFollowUpNote}</p>
            ) : null}
            <div style={styles.formGridCompact}>
              <label style={fieldLabelStyle}>
                <span>Status</span>
                <select
                  value={appointment.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value as AppointmentStatus;
                    if (nextStatus === 'cancelled' && !window.confirm('Cancel this appointment?')) {
                      return;
                    }
                    void onAppointmentStatusChange(appointment.id, nextStatus);
                  }}
                  style={styles.input}
                >
                  {appointmentStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {appointmentStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <ScheduleDraftFields
                draft={editDraft}
                technicians={technicians}
                prefix="Appointment"
                onChange={(patch) => onAppointmentEditDraftChange(appointment.id, editDraft, patch)}
              />
            </div>
            <button
              type="button"
              style={styles.button}
              onClick={() => void onSaveAppointmentSchedule(appointment.id)}
            >
              Save appointment
            </button>
          </section>
        );
      })}
      {canAddAppointment ? (
        isAddFormOpen ? (
          <section style={styles.panel} aria-label="Add appointment">
            <div style={styles.formGridCompact}>
              <ScheduleDraftFields
                draft={draft}
                technicians={technicians}
                prefix="New appointment"
                onChange={(patch) => onAppointmentDraftChange(job.id, patch)}
              />
            </div>
            <div style={styles.inlineActionBar}>
              <button type="button" style={styles.primaryButton} onClick={handleAddAppointment}>
                Add appointment
              </button>
              <button type="button" style={styles.button} onClick={() => setIsAddFormOpen(false)}>
                Cancel
              </button>
            </div>
          </section>
        ) : (
          <button type="button" style={styles.primaryButton} onClick={() => setIsAddFormOpen(true)}>
            Add appointment
          </button>
        )
      ) : (
        <p style={styles.tinyMuted}>Reopen to add appointments.</p>
      )}
    </div>
  );
}

function ScheduleDraftFields({
  draft,
  technicians,
  prefix,
  onChange
}: {
  draft: AppointmentDraft;
  technicians: JobsWorkspaceResponse['technicians'];
  prefix: string;
  onChange: (patch: Partial<AppointmentDraft>) => void;
}) {
  return (
    <>
      <label style={fieldLabelStyle}>
        <span>Date</span>
        <input
          aria-label={`${prefix} date`}
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
          aria-label={`${prefix} start time`}
          type="text"
          placeholder="HH:MM"
          pattern="[0-2][0-9]:[0-5][0-9]"
          title="Use 24-hour HH:MM, for example 13:45."
          autoComplete="off"
          value={draft.scheduledStartTime}
          disabled={!draft.scheduledDate}
          onChange={(event) => onChange({ scheduledStartTime: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>End</span>
        <input
          aria-label={`${prefix} end time`}
          type="text"
          placeholder="HH:MM"
          pattern="[0-2][0-9]:[0-5][0-9]"
          title="Use 24-hour HH:MM, for example 15:45."
          autoComplete="off"
          value={draft.scheduledEndTime}
          disabled={!draft.scheduledDate}
          onChange={(event) => onChange({ scheduledEndTime: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>Window</span>
        <input
          aria-label={`${prefix} time window`}
          value={draft.timeWindowLabel}
          onChange={(event) => onChange({ timeWindowLabel: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>Tech</span>
        <select
          aria-label={`${prefix} technician`}
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
    </>
  );
}

function formatFinishOutcome(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.85rem',
  fontWeight: 700
};
