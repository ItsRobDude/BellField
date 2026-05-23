'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import type { JobsWorkspaceResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildDispatchBoardModel,
  type DispatchAppointmentCard,
  type DispatchBoardModel
} from './dispatch-board-data';

type DispatchBoardPanelProps = {
  jobsWorkspace: JobsWorkspaceResponse;
  viewDate?: string;
  onOpenInJobsPanel?: (jobId: string) => void;
};

const appointmentStatusLabels: Record<DispatchAppointmentCard['status'], string> = {
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

export function DispatchBoardPanel({ jobsWorkspace, viewDate, onOpenInJobsPanel }: DispatchBoardPanelProps) {
  const model = useMemo<DispatchBoardModel>(
    () => buildDispatchBoardModel(jobsWorkspace, viewDate),
    [jobsWorkspace, viewDate]
  );

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | undefined>();

  const selectedCard = selectedAppointmentId ? model.cardLookup.get(selectedAppointmentId) : undefined;
  const totalCardCount = model.cardLookup.size;
  const unassignedCount = model.unassignedQueue.length;

  return (
    <section style={styles.card} aria-label="Dispatch board v1 foundation">
      <div style={styles.row}>
        <div>
          <div style={styles.kicker}>Dispatch board</div>
          <h2 style={styles.heading}>Office dispatch v1</h2>
          <p style={styles.muted}>
            Reads jobs and appointments from the same workspace the office panel already loads. Reassignment and
            scheduling still happen through the jobs/appointments panel until v1 wires those actions through.
          </p>
        </div>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>{totalCardCount} appointments on board</span>
          <span style={unassignedCount > 0 ? styles.dangerBadge : styles.badge}>{unassignedCount} unassigned</span>
        </div>
      </div>

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
                          ? 'No appointments today.'
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
              onOpenInJobsPanel={onOpenInJobsPanel}
              onClose={() => setSelectedAppointmentId(undefined)}
            />
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <h3 style={styles.subheading}>Detail drawer</h3>
              <p style={styles.tinyMuted}>Click an appointment card to review who, where, and when.</p>
              <p style={styles.tinyMuted}>
                Reassignment, rescheduling, and status edits remain in the jobs/appointments panel for v1.
              </p>
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
  onOpenInJobsPanel?: (jobId: string) => void;
  onClose: () => void;
};

function DispatchDetailDrawer({ card, onOpenInJobsPanel, onClose }: DispatchDetailDrawerProps) {
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
        <DrawerField label="Technician" value={card.technicianName ?? 'Unassigned'} />
        <DrawerField label="Date" value={card.scheduledDate ?? 'Unscheduled'} />
        <DrawerField label="Time window" value={card.timeWindowLabel ?? 'No window'} />
        {card.finishOutcome ? <DrawerField label="Finish outcome" value={card.finishOutcome} /> : null}
      </dl>
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

const dispatchSplitStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(18rem, 1fr)',
  marginTop: '1rem'
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
