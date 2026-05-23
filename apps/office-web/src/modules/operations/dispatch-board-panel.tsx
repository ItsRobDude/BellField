'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AppointmentStatus, JobsWorkspaceResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildDispatchBoardModel,
  type DispatchAppointmentCard,
  type DispatchBoardModel
} from './dispatch-board-data';

export type DispatchScheduleDraft = {
  scheduledDate: string;
  timeWindowLabel: string;
  technicianId: string;
};

type DispatchBoardPanelProps = {
  jobsWorkspace: JobsWorkspaceResponse;
  viewDate?: string;
  onViewDateChange?: (date: string) => void;
  onOpenInJobsPanel?: (jobId: string) => void;
  onSaveAppointmentSchedule?: (appointmentId: string, draft: DispatchScheduleDraft) => Promise<void>;
  onUpdateAppointmentStatus?: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
};

const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  onTheWay: 'On the way',
  arrived: 'Arrived',
  working: 'Working',
  finished: 'Finished',
  noAnswer: 'No answer',
  cancelled: 'Cancelled'
};

const appointmentStatusOptions: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'dispatched',
  'onTheWay',
  'arrived',
  'working',
  'finished',
  'noAnswer',
  'cancelled'
];

export function DispatchBoardPanel({
  jobsWorkspace,
  viewDate,
  onViewDateChange,
  onOpenInJobsPanel,
  onSaveAppointmentSchedule,
  onUpdateAppointmentStatus
}: DispatchBoardPanelProps) {
  const effectiveViewDate = viewDate || getDateInputValue();
  const model = useMemo<DispatchBoardModel>(
    () => buildDispatchBoardModel(jobsWorkspace, effectiveViewDate),
    [jobsWorkspace, effectiveViewDate]
  );

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | undefined>();

  const selectedCard = selectedAppointmentId ? model.cardLookup.get(selectedAppointmentId) : undefined;
  const totalCardCount = model.cardLookup.size;
  const unassignedCount = model.unassignedQueue.length;

  useEffect(() => {
    if (selectedAppointmentId && !model.cardLookup.has(selectedAppointmentId)) {
      setSelectedAppointmentId(undefined);
    }
  }, [model.cardLookup, selectedAppointmentId]);

  return (
    <section style={styles.card} aria-label="Dispatch board v1 foundation">
      <div style={styles.row}>
        <div>
          <div style={styles.kicker}>Dispatch board</div>
          <h2 style={styles.heading}>Office dispatch v1</h2>
          <p style={styles.muted}>
            Reads jobs and appointments from the same workspace the office panel already loads. Use the detail drawer
            to assign technicians or reschedule the visible day view.
          </p>
        </div>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>{totalCardCount} appointments on board</span>
          <span style={unassignedCount > 0 ? styles.dangerBadge : styles.badge}>{unassignedCount} unassigned</span>
        </div>
      </div>

      <label style={dateInputLabelStyle}>
        <span style={styles.tinyMuted}>Dispatch date</span>
        <input
          type="date"
          aria-label="Dispatch date"
          value={effectiveViewDate}
          onChange={(event) => onViewDateChange?.(event.target.value || getDateInputValue())}
          style={styles.input}
        />
      </label>

      <div style={dispatchSplitStyle}>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <section style={styles.panel} aria-label="Unassigned appointments">
            <div style={styles.row}>
              <h3 style={styles.subheading}>Unassigned queue</h3>
              <span style={styles.tinyMuted}>
                {unassignedCount === 0
                  ? 'Every visible appointment has a technician.'
                  : `${unassignedCount} ${unassignedCount === 1 ? 'appointment needs' : 'appointments need'} a technician.`}
              </span>
            </div>
            {model.unassignedQueue.length === 0 ? (
              <p style={styles.tinyMuted}>No unassigned appointments in the current view.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {model.unassignedQueue.map((card) => (
                  <DispatchCardButton
                    key={card.appointmentId}
                    card={card}
                    isSelected={card.appointmentId === selectedAppointmentId}
                    onSelect={() => setSelectedAppointmentId(card.appointmentId)}
                  />
                ))}
              </div>
            )}
          </section>

          <section style={styles.panel} aria-label="Technician rows">
            <h3 style={styles.subheading}>Technician rows</h3>
            {model.technicianRows.length === 0 ? (
              <p style={styles.tinyMuted}>No technicians available in this workspace yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {model.technicianRows.map((row) => (
                  <section
                    key={row.technicianId}
                    style={technicianRowStyle}
                    aria-label={`Appointments for ${row.technicianName}`}
                  >
                    <div style={technicianRowHeaderStyle}>
                      <div style={{ display: 'grid' }}>
                        <strong>{row.technicianName}</strong>
                        <span style={styles.tinyMuted}>{row.roleId}</span>
                      </div>
                      <span style={styles.tinyMuted}>
                        {row.cards.length === 0
                          ? 'No appointments on this date.'
                          : `${row.cards.length} ${row.cards.length === 1 ? 'appointment' : 'appointments'}`}
                      </span>
                    </div>
                    {row.cards.length === 0 ? null : (
                      <div style={{ display: 'grid', gap: '0.4rem' }}>
                        {row.cards.map((card) => (
                          <DispatchCardButton
                            key={card.appointmentId}
                            card={card}
                            isSelected={card.appointmentId === selectedAppointmentId}
                            onSelect={() => setSelectedAppointmentId(card.appointmentId)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside style={styles.drawerPanel} aria-label="Appointment detail drawer">
          {selectedCard ? (
            <DispatchDetailDrawer
              card={selectedCard}
              technicians={jobsWorkspace.technicians}
              onOpenInJobsPanel={onOpenInJobsPanel}
              onSaveAppointmentSchedule={onSaveAppointmentSchedule}
              onUpdateAppointmentStatus={onUpdateAppointmentStatus}
              onClose={() => setSelectedAppointmentId(undefined)}
            />
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <h3 style={styles.subheading}>Detail drawer</h3>
              <p style={styles.tinyMuted}>Click an appointment card to review or change dispatch scheduling.</p>
              <p style={styles.tinyMuted}>Status edits can be made from the drawer after a card is selected.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

type DispatchCardButtonProps = {
  card: DispatchAppointmentCard;
  isSelected: boolean;
  onSelect: () => void;
};

function DispatchCardButton({ card, isSelected, onSelect }: DispatchCardButtonProps) {
  const buttonStyle: CSSProperties = {
    ...styles.cardButton,
    borderColor: isSelected ? '#1c6b57' : '#e5dcc8',
    boxShadow: isSelected ? '0 0 0 2px rgba(28, 107, 87, 0.18)' : undefined
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`Appointment ${card.jobNumber} for ${card.customerName}`}
      style={buttonStyle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong>Job {card.jobNumber}</strong>
        <span style={styles.tinyMuted}>{formatTimeSlot(card)}</span>
      </div>
      <span>{card.jobSummary}</span>
      <span style={styles.tinyMuted}>
        {card.customerName} - {card.locationName}
      </span>
      <div style={styles.badgeRow}>
        <span style={styles.badge}>{appointmentStatusLabels[card.status]}</span>
        {card.needsOfficeReview ? <span style={styles.dangerBadge}>Office review</span> : null}
      </div>
    </button>
  );
}

type DispatchDetailDrawerProps = {
  card: DispatchAppointmentCard;
  technicians: JobsWorkspaceResponse['technicians'];
  onOpenInJobsPanel?: (jobId: string) => void;
  onSaveAppointmentSchedule?: (appointmentId: string, draft: DispatchScheduleDraft) => Promise<void>;
  onUpdateAppointmentStatus?: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  onClose: () => void;
};

function DispatchDetailDrawer({
  card,
  technicians,
  onOpenInJobsPanel,
  onSaveAppointmentSchedule,
  onUpdateAppointmentStatus,
  onClose
}: DispatchDetailDrawerProps) {
  const [draft, setDraft] = useState<DispatchScheduleDraft>(() => createDraftFromCard(card));
  const [statusDraft, setStatusDraft] = useState<AppointmentStatus>(card.status);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const hasCurrentTechnicianOption =
    !draft.technicianId || technicians.some((technician) => technician.id === draft.technicianId);
  const isUnchanged = isSameScheduleDraft(card, draft);
  const isStatusUnchanged = statusDraft === card.status;

  useEffect(() => {
    setDraft(createDraftFromCard(card));
    setStatusDraft(card.status);
    setIsSaving(false);
    setIsSavingStatus(false);
  }, [card.appointmentId, card.scheduledDate, card.timeWindowLabel, card.technicianId, card.status]);

  async function handleSave() {
    if (!onSaveAppointmentSchedule || isSaving || isUnchanged) {
      return;
    }

    setIsSaving(true);

    try {
      await onSaveAppointmentSchedule(card.appointmentId, draft);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusSave() {
    if (!onUpdateAppointmentStatus || isSavingStatus || isStatusUnchanged) {
      return;
    }

    if (
      statusDraft === 'cancelled' &&
      !window.confirm('Cancel this appointment? It will leave the dispatch board after the workspace refreshes.')
    ) {
      return;
    }

    setIsSavingStatus(true);

    try {
      await onUpdateAppointmentStatus(card.appointmentId, statusDraft);
    } finally {
      setIsSavingStatus(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>Job {card.jobNumber}</h3>
        <button type="button" onClick={onClose} style={styles.button} aria-label="Close detail drawer">
          Close
        </button>
      </div>
      <p style={styles.muted}>{card.jobSummary}</p>
      <div style={styles.badgeRow}>
        <span style={styles.badge}>{appointmentStatusLabels[card.status]}</span>
        <span style={styles.badge}>{card.jobType}</span>
        {card.needsOfficeReview ? <span style={styles.dangerBadge}>Needs office review</span> : null}
      </div>
      <dl style={drawerDefinitionStyle}>
        <DrawerField label="Customer" value={card.customerName} />
        <DrawerField label="Bill-to" value={card.billToCustomerName} />
        <DrawerField
          label="Location"
          value={`${card.locationName}${card.locationCity ? ` - ${card.locationCity}, ${card.locationState ?? ''}`.trimEnd() : ''}`}
        />
        {card.finishOutcome ? <DrawerField label="Finish outcome" value={card.finishOutcome} /> : null}
      </dl>
      <div style={dispatchEditGridStyle}>
        <label style={editFieldLabelStyle}>
          <span style={styles.tinyMuted}>Status</span>
          <select
            aria-label="Dispatch appointment status"
            value={statusDraft}
            onChange={(event) => setStatusDraft(event.target.value as AppointmentStatus)}
            style={styles.input}
          >
            {appointmentStatusOptions.map((status) => (
              <option key={status} value={status}>
                {appointmentStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        {onUpdateAppointmentStatus ? (
          <button
            type="button"
            style={styles.button}
            onClick={() => void handleStatusSave()}
            disabled={isSavingStatus || isStatusUnchanged}
          >
            {isSavingStatus ? 'Saving status...' : 'Save status'}
          </button>
        ) : null}
      </div>
      <div style={dispatchEditGridStyle}>
        <label style={editFieldLabelStyle}>
          <span style={styles.tinyMuted}>Date</span>
          <input
            type="date"
            aria-label="Dispatch appointment date"
            value={draft.scheduledDate}
            onChange={(event) => setDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
            style={styles.input}
          />
        </label>
        <label style={editFieldLabelStyle}>
          <span style={styles.tinyMuted}>Time window</span>
          <input
            aria-label="Dispatch time window"
            value={draft.timeWindowLabel}
            onChange={(event) => setDraft((current) => ({ ...current, timeWindowLabel: event.target.value }))}
            placeholder="1:00 PM - 3:00 PM"
            style={styles.input}
          />
        </label>
        <label style={editFieldLabelStyle}>
          <span style={styles.tinyMuted}>Technician</span>
          <select
            aria-label="Dispatch technician"
            value={draft.technicianId}
            onChange={(event) => setDraft((current) => ({ ...current, technicianId: event.target.value }))}
            style={styles.input}
          >
            <option value="">Unassigned</option>
            {!hasCurrentTechnicianOption ? (
              <option value={draft.technicianId}>{card.technicianName ?? 'Current technician'}</option>
            ) : null}
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {onSaveAppointmentSchedule ? (
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => void handleSave()}
          disabled={isSaving || isUnchanged}
        >
          {isSaving ? 'Saving dispatch changes...' : 'Save dispatch changes'}
        </button>
      ) : null}
      {onOpenInJobsPanel ? (
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => onOpenInJobsPanel(card.jobId)}
          aria-label={`Open job ${card.jobNumber} in the jobs panel`}
        >
          Open in jobs panel
        </button>
      ) : null}
    </div>
  );
}

type DrawerFieldProps = { label: string; value: string };

function DrawerField({ label, value }: DrawerFieldProps) {
  return (
    <div style={drawerFieldStyle}>
      <dt style={drawerFieldLabelStyle}>{label}</dt>
      <dd style={drawerFieldValueStyle}>{value}</dd>
    </div>
  );
}

function formatTimeSlot(card: DispatchAppointmentCard): string {
  if (!card.scheduledDate && !card.timeWindowLabel) {
    return 'Unscheduled';
  }

  return [card.scheduledDate, card.timeWindowLabel].filter(Boolean).join(' - ');
}

function createDraftFromCard(card: DispatchAppointmentCard): DispatchScheduleDraft {
  return {
    scheduledDate: card.scheduledDate ?? '',
    timeWindowLabel: card.timeWindowLabel ?? '',
    technicianId: card.technicianId ?? ''
  };
}

function isSameScheduleDraft(card: DispatchAppointmentCard, draft: DispatchScheduleDraft): boolean {
  return (
    draft.scheduledDate === (card.scheduledDate ?? '') &&
    draft.timeWindowLabel === (card.timeWindowLabel ?? '') &&
    draft.technicianId === (card.technicianId ?? '')
  );
}

function getDateInputValue(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

const dispatchSplitStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(18rem, 1fr)',
  marginTop: '1rem'
};

const dateInputLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.35rem',
  marginTop: '1rem',
  maxWidth: '16rem'
};

const technicianRowStyle: CSSProperties = {
  border: '1px solid #eadfc9',
  borderRadius: 12,
  display: 'grid',
  gap: '0.5rem',
  padding: '0.75rem'
};

const technicianRowHeaderStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'space-between'
};

const drawerDefinitionStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  margin: 0
};

const dispatchEditGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem'
};

const editFieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem'
};

const drawerFieldStyle: CSSProperties = {
  display: 'grid',
  gap: '0.15rem'
};

const drawerFieldLabelStyle: CSSProperties = {
  color: '#7b8794',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  margin: 0,
  textTransform: 'uppercase'
};

const drawerFieldValueStyle: CSSProperties = {
  color: '#1f2933',
  fontSize: '0.95rem',
  margin: 0
};
