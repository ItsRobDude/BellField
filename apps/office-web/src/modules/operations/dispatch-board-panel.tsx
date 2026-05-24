'use client';

import { useMemo, type CSSProperties } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildDispatchBoardModel,
  type DispatchAppointmentCard,
  type DispatchBoardModel
} from './dispatch-board-data';
import { DispatchDatePicker, getDateInputValue } from './dispatch-date-picker';
import { formatAppointmentScheduleDisplay } from './appointment-schedule-format';
import { appointmentStatusLabels } from './job-work-types';

export type DispatchScheduleDraft = {
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  timeWindowLabel: string;
  technicianId: string;
};

const timelineStartMinutes = 7 * 60;
const timelineEndMinutes = 18 * 60;
const timelineSlotMinutes = 15;
const timelineSlotCount = (timelineEndMinutes - timelineStartMinutes) / timelineSlotMinutes;
const timelineTickLabels = [
  { label: '7 AM', column: 1 },
  { label: '9 AM', column: 9 },
  { label: '11 AM', column: 17 },
  { label: '1 PM', column: 25 },
  { label: '3 PM', column: 33 },
  { label: '5 PM', column: 41 }
];

type DispatchBoardPanelProps = {
  dispatchBoard: DispatchBoardResponse;
  viewDate?: string;
  onViewDateChange?: (date: string) => void;
  onOpenJobDetail?: (jobId: string, appointmentId?: string) => void;
  isRefreshing?: boolean;
  lastRefreshedAt?: string | null;
  onRefresh?: () => Promise<void>;
};

export function DispatchBoardPanel({
  dispatchBoard,
  viewDate,
  onViewDateChange,
  onOpenJobDetail,
  isRefreshing = false,
  lastRefreshedAt,
  onRefresh
}: DispatchBoardPanelProps) {
  const effectiveViewDate = viewDate || getDateInputValue();
  const model = useMemo<DispatchBoardModel>(
    () => buildDispatchBoardModel(dispatchBoard),
    [dispatchBoard]
  );
  const totalCardCount = model.cardLookup.size;
  const unassignedCount = model.unassignedQueue.length;

  return (
    <section style={styles.workspacePanel} aria-label="Dispatch board">
      <div style={styles.row}>
        <div>
          <h1 style={styles.compactTitle}>Dispatch</h1>
          <p style={styles.muted}>{totalCardCount} appointments</p>
        </div>
        <div style={styles.badgeRow}>
          <span style={unassignedCount > 0 ? styles.dangerBadge : styles.badge}>
            {unassignedCount} unassigned
          </span>
        </div>
      </div>

      <div style={dispatchToolbarStyle}>
        <DispatchDatePicker value={effectiveViewDate} onChange={onViewDateChange} />
        <div style={refreshControlStyle}>
          {onRefresh ? (
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              style={styles.button}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          ) : null}
          <span aria-live="polite" style={styles.tinyMuted}>
            {isRefreshing ? 'Refreshing...' : formatLastRefreshedAt(lastRefreshedAt)}
          </span>
        </div>
      </div>

      <div style={dispatchTimelineViewportStyle} role="group" aria-label="Dispatch timeline">
        <div style={dispatchTimelineContentStyle}>
          <div style={timelineHeaderRowStyle} aria-hidden="true">
            <div style={timelineHeaderLabelStyle} />
            <div style={timelineLaneCellStyle}>
              <div style={timelineHeaderStyle}>
                {timelineTickLabels.map((tick) => (
                  <span
                    key={tick.label}
                    style={{ ...timelineTickStyle, gridColumn: `${tick.column} / span 4` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={dispatchBoardStyle}>
            <DispatchTimelineRow
              label="Unassigned"
              ariaLabel="Unassigned appointments"
              cards={model.unassignedQueue}
              badgeStyle={unassignedCount > 0 ? styles.dangerBadge : styles.badge}
              onOpenJobDetail={onOpenJobDetail}
            />
            {model.technicianRows.map((row) => (
              <DispatchTimelineRow
                key={row.technicianId}
                label={row.technicianName}
                ariaLabel={`Appointments for ${row.technicianName}`}
                cards={row.cards}
                badgeStyle={styles.badge}
                onOpenJobDetail={onOpenJobDetail}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type DispatchTimelineRowProps = {
  label: string;
  ariaLabel: string;
  cards: DispatchAppointmentCard[];
  badgeStyle: CSSProperties;
  onOpenJobDetail?: DispatchBoardPanelProps['onOpenJobDetail'];
};

function DispatchTimelineRow({
  label,
  ariaLabel,
  cards,
  badgeStyle,
  onOpenJobDetail
}: DispatchTimelineRowProps) {
  return (
    <section style={timelineRowStyle} aria-label={ariaLabel}>
      <div style={timelineRowLabelStyle}>
        <strong>{label}</strong>
        <span style={badgeStyle}>{cards.length}</span>
      </div>
      <div style={timelineLaneCellStyle}>
        <div style={timelineLaneStyle}>
          {cards.length === 0 ? <span style={emptyTimelineStyle}>None</span> : null}
          {cards.map((card, index) => (
            <DispatchCardButton
              key={card.appointmentId}
              card={card}
              placementStyle={getTimelineCardPlacementStyle(card, index)}
              onOpenJobDetail={() => onOpenJobDetail?.(card.jobId, card.appointmentId)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type DispatchCardButtonProps = {
  card: DispatchAppointmentCard;
  placementStyle?: CSSProperties;
  onOpenJobDetail: () => void;
};

function DispatchCardButton({ card, placementStyle, onOpenJobDetail }: DispatchCardButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpenJobDetail}
      aria-label={`Appointment ${card.jobNumber} for ${card.customerName}`}
      style={{ ...styles.cardButton, ...timelineCardStyle, ...placementStyle }}
    >
      <div style={styles.row}>
        <strong>Job {card.jobNumber}</strong>
        <span style={styles.tinyMuted}>{formatAppointmentScheduleDisplay(card)}</span>
      </div>
      <span>{card.jobSummary}</span>
      <span style={styles.tinyMuted}>
        {card.customerName} - {card.locationName}
      </span>
      {card.equipmentCount > 0 ? (
        <span style={styles.tinyMuted}>{formatEquipmentGlance(card)}</span>
      ) : null}
      <div style={styles.badgeRow}>
        <span style={styles.badge}>{appointmentStatusLabels[card.status]}</span>
        {card.needsOfficeReview ? <span style={styles.dangerBadge}>Review</span> : null}
      </div>
    </button>
  );
}

function formatEquipmentGlance(card: DispatchAppointmentCard): string {
  const labels = card.equipment.map((equipment) =>
    `${equipment.equipmentType} ${equipment.brand} ${equipment.model}`.trim()
  );
  const hiddenCount = card.equipmentCount - card.equipment.length;

  return hiddenCount > 0 ? `${labels.join(', ')} +${hiddenCount}` : labels.join(', ');
}

function getTimelineCardPlacementStyle(
  card: DispatchAppointmentCard,
  index: number
): CSSProperties {
  const startMinutes = parseTimeToMinutes(card.scheduledStartTime);
  const endMinutes = parseTimeToMinutes(card.scheduledEndTime);

  if (startMinutes === null) {
    return {
      gridColumn: `${timelineSlotCount + 1} / span 8`,
      gridRow: index + 1
    };
  }

  const clampedStart = Math.max(
    timelineStartMinutes,
    Math.min(startMinutes, timelineEndMinutes - timelineSlotMinutes)
  );
  const clampedEnd =
    endMinutes === null
      ? clampedStart + 90
      : Math.max(clampedStart + timelineSlotMinutes, Math.min(endMinutes, timelineEndMinutes));
  const startSlot = Math.floor((clampedStart - timelineStartMinutes) / timelineSlotMinutes) + 1;
  const durationSlots = Math.max(4, Math.ceil((clampedEnd - clampedStart) / timelineSlotMinutes));

  return {
    gridColumn: `${startSlot} / span ${durationSlots}`
  };
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatLastRefreshedAt(value?: string | null): string {
  if (!value) {
    return 'Not refreshed';
  }

  const refreshedAt = new Date(value);

  if (Number.isNaN(refreshedAt.getTime())) {
    return 'Refreshed';
  }

  return `Refreshed ${refreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const dispatchToolbarStyle: CSSProperties = {
  alignItems: 'end',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  justifyContent: 'space-between',
  marginTop: '1rem'
};

const refreshControlStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  justifyContent: 'flex-end'
};

const timelineLabelWidth = '8.5rem';
const timelineLaneMinWidth = '58rem';
const timelineColumnGap = '0.75rem';

const dispatchTimelineViewportStyle: CSSProperties = {
  marginTop: '0.75rem',
  overflowX: 'auto',
  paddingBottom: '0.35rem'
};

const dispatchTimelineContentStyle: CSSProperties = {
  display: 'grid',
  gap: '0.85rem',
  minWidth: `calc(${timelineLabelWidth} + ${timelineColumnGap} + ${timelineLaneMinWidth})`,
  width: '100%'
};

const dispatchBoardStyle: CSSProperties = {
  display: 'grid',
  gap: '0.85rem'
};

const timelineGridTemplateColumns = `repeat(${timelineSlotCount}, minmax(1rem, 1fr)) minmax(11rem, 12rem)`;

const timelineHeaderRowStyle: CSSProperties = {
  display: 'grid',
  gap: timelineColumnGap,
  gridTemplateColumns: `${timelineLabelWidth} minmax(${timelineLaneMinWidth}, 1fr)`,
  minWidth: 0
};

const timelineHeaderLabelStyle: CSSProperties = {
  background: '#f7f9f7',
  left: 0,
  position: 'sticky',
  zIndex: 2
};

const timelineHeaderStyle: CSSProperties = {
  color: '#7b8794',
  display: 'grid',
  fontSize: '0.8rem',
  gap: '0.25rem',
  gridTemplateColumns: timelineGridTemplateColumns,
  minWidth: timelineLaneMinWidth,
  width: '100%'
};

const timelineTickStyle: CSSProperties = {
  borderLeft: '1px solid #dfe6df',
  paddingLeft: '0.35rem'
};

const timelineRowStyle: CSSProperties = {
  alignItems: 'stretch',
  display: 'grid',
  gap: timelineColumnGap,
  gridTemplateColumns: `${timelineLabelWidth} minmax(${timelineLaneMinWidth}, 1fr)`,
  minWidth: 0
};

const timelineRowLabelStyle: CSSProperties = {
  alignContent: 'start',
  background: '#ffffff',
  border: '1px solid #dfe6df',
  borderRadius: 8,
  display: 'grid',
  gap: '0.5rem',
  justifyItems: 'start',
  left: 0,
  padding: '0.8rem',
  position: 'sticky',
  zIndex: 2
};

const timelineLaneCellStyle: CSSProperties = {
  minWidth: 0
};

const timelineLaneStyle: CSSProperties = {
  alignItems: 'start',
  background: '#ffffff',
  border: '1px solid #dfe6df',
  borderRadius: 8,
  display: 'grid',
  gap: '0.5rem',
  gridTemplateColumns: timelineGridTemplateColumns,
  minHeight: '6.5rem',
  minWidth: timelineLaneMinWidth,
  padding: '0.75rem',
  width: '100%'
};

const timelineCardStyle: CSSProperties = {
  minWidth: '10rem'
};

const emptyTimelineStyle: CSSProperties = {
  alignSelf: 'center',
  color: '#7b8794',
  gridColumn: '1 / span 4'
};
