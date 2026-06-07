'use client';

import { useRef, type CSSProperties } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import { appointmentStatusLabels } from './job-work-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { DispatchScheduleDraft, DispatchScheduleEditorState } from './dispatch-schedule-types';
import {
  timelineCardMinHeight,
  timelineCardTextLineHeight,
  timelineColumnGap,
  timelineEndMinutes,
  timelineGridTemplateColumns,
  timelineLabelWidth,
  timelineLaneMinWidth,
  timelineRowMinHeight,
  timelineSlotCount,
  timelineSlotMinutes,
  timelineStartMinutes
} from './dispatch-timeline-layout';

export type DispatchContextMenuPosition = {
  x: number;
  y: number;
};

type DispatchTimelineRowProps = {
  label: string;
  sublabel: string;
  ariaLabel: string;
  cards: DispatchAppointmentCard[];
  activeScheduleEditor: DispatchScheduleEditorState | null;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail?: (jobId: string, appointmentId?: string) => void;
  onOpenScheduleEditor?: (card: DispatchAppointmentCard) => void;
  onOpenContextMenu?: (
    card: DispatchAppointmentCard,
    position: DispatchContextMenuPosition
  ) => void;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

export function DispatchTimelineRow({
  label,
  sublabel,
  ariaLabel,
  cards,
  activeScheduleEditor,
  technicians,
  onOpenJobDetail,
  onOpenScheduleEditor,
  onOpenContextMenu,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchTimelineRowProps) {
  return (
    <section style={timelineRowStyle} aria-label={ariaLabel}>
      <div style={timelineRowLabelStyle}>
        <strong>{label}</strong>
        <span style={timelineRowSublabelStyle}>{sublabel}</span>
      </div>
      <div style={timelineLaneCellStyle}>
        <div style={timelineLaneStyle}>
          {cards.length === 0 ? <span style={emptyTimelineStyle}>None</span> : null}
          {cards.map((card, index) => (
            <DispatchCardButton
              key={card.appointmentId}
              card={card}
              activeScheduleEditor={
                activeScheduleEditor?.appointmentId === card.appointmentId
                  ? activeScheduleEditor
                  : null
              }
              placementStyle={getTimelineCardPlacementStyle(card, index)}
              technicians={technicians}
              onOpenJobDetail={() => onOpenJobDetail?.(card.jobId, card.appointmentId)}
              onOpenScheduleEditor={onOpenScheduleEditor}
              onOpenContextMenu={onOpenContextMenu}
              onScheduleDraftChange={onScheduleDraftChange}
              onScheduleEditorCancel={onScheduleEditorCancel}
              onScheduleEditorSave={onScheduleEditorSave}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type DispatchCardButtonProps = {
  card: DispatchAppointmentCard;
  activeScheduleEditor: DispatchScheduleEditorState | null;
  placementStyle?: CSSProperties;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail: () => void;
  onOpenScheduleEditor?: (card: DispatchAppointmentCard) => void;
  onOpenContextMenu?: (
    card: DispatchAppointmentCard,
    position: DispatchContextMenuPosition
  ) => void;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

function DispatchCardButton({
  card,
  activeScheduleEditor,
  placementStyle,
  technicians,
  onOpenJobDetail,
  onOpenScheduleEditor,
  onOpenContextMenu,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchCardButtonProps) {
  const cardFrameRef = useRef<HTMLDivElement | null>(null);
  const address = formatDispatchCardAddress(card);
  const statusLabel = appointmentStatusLabels[card.status];
  const reviewLabel = card.needsOfficeReview ? ', review needed' : '';

  return (
    <div
      ref={cardFrameRef}
      style={{ ...timelineCardFrameStyle, ...placementStyle }}
      onContextMenu={(event) => {
        if (!onOpenContextMenu) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu(card, { x: event.clientX, y: event.clientY });
      }}
    >
      <button
        type="button"
        onClick={onOpenJobDetail}
        onKeyDown={(event) => {
          if (!onOpenContextMenu) {
            return;
          }

          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
            return;
          }

          const frameRect = cardFrameRef.current?.getBoundingClientRect();

          event.preventDefault();
          onOpenContextMenu(card, {
            x: frameRect ? frameRect.left + 16 : 16,
            y: frameRect ? frameRect.top + 16 : 16
          });
        }}
        aria-label={`Job ${card.jobNumber}, ${card.locationName}, ${address}, ${statusLabel}${reviewLabel}`}
        style={timelineCardMainButtonStyle}
      >
        <span aria-hidden="true" style={getTimelineCardRailStyle(card)} />
        <div style={timelineCardBodyStyle}>
          <div style={timelineCardTitleRowStyle}>
            <span style={timelineJobChipStyle}>#{card.jobNumber}</span>
            <strong style={timelineCardLocationStyle}>{card.locationName}</strong>
            {card.needsOfficeReview ? <span style={timelineReviewChipStyle}>Review</span> : null}
          </div>
          <span style={timelineCardAddressStyle}>{address}</span>
        </div>
      </button>
      {onOpenScheduleEditor ? (
        <button
          type="button"
          aria-label={`Edit schedule for job ${card.jobNumber}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenScheduleEditor(card);
          }}
          style={timelineCardEditButtonStyle}
        >
          Edit
        </button>
      ) : null}
      {activeScheduleEditor ? (
        <DispatchSchedulePopover
          card={card}
          draft={activeScheduleEditor.draft}
          errorMessage={activeScheduleEditor.errorMessage}
          isSaving={activeScheduleEditor.isSaving}
          technicians={technicians}
          onCancel={onScheduleEditorCancel}
          onChange={onScheduleDraftChange}
          onSave={onScheduleEditorSave}
        />
      ) : null}
    </div>
  );
}

function DispatchSchedulePopover({
  card,
  draft,
  errorMessage,
  isSaving,
  technicians,
  onCancel,
  onChange,
  onSave
}: {
  card: DispatchAppointmentCard;
  draft: DispatchScheduleDraft;
  errorMessage: string | null;
  isSaving: boolean;
  technicians: DispatchBoardResponse['technicians'];
  onCancel: () => void;
  onChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onSave: () => void;
}) {
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

export function formatDispatchCardAddress(card: DispatchAppointmentCard): string {
  const cityState = [card.locationCity, card.locationState].filter(Boolean).join(', ');

  return [card.locationAddressLine1, cityState].filter(Boolean).join(', ');
}

export function createDispatchScheduleDraft(
  card: DispatchAppointmentCard,
  fallbackScheduledDate: string
): DispatchScheduleDraft {
  return {
    scheduledDate: card.scheduledDate ?? fallbackScheduledDate,
    scheduledStartTime: card.scheduledStartTime ?? '',
    scheduledEndTime: card.scheduledEndTime ?? '',
    timeWindowLabel: card.timeWindowLabel ?? '',
    technicianId: card.technicianId ?? ''
  };
}

export function formatTechnicianRowSublabel(roleId: string): string {
  return roleId === 'technician' ? 'Technician' : roleId;
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

const timelineRowStyle: CSSProperties = {
  alignItems: 'stretch',
  display: 'grid',
  gap: timelineColumnGap,
  gridTemplateColumns: `${timelineLabelWidth} minmax(${timelineLaneMinWidth}, 1fr)`,
  minHeight: timelineRowMinHeight,
  minWidth: 0
};

const timelineRowLabelStyle: CSSProperties = {
  alignContent: 'center',
  background: '#fbfcfa',
  border: '1px solid #dfe6df',
  borderRadius: 8,
  boxSizing: 'border-box',
  display: 'grid',
  gap: '0.15rem',
  justifyItems: 'start',
  left: 0,
  minHeight: timelineRowMinHeight,
  padding: '0.55rem 0.65rem',
  position: 'sticky',
  zIndex: 2
};

const timelineRowSublabelStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '0.72rem',
  fontWeight: 700,
  lineHeight: 1.2
};

export const timelineLaneCellStyle: CSSProperties = {
  display: 'grid',
  minWidth: 0
};

const timelineLaneStyle: CSSProperties = {
  alignItems: 'stretch',
  background: '#ffffff',
  border: '1px solid #dfe6df',
  borderRadius: 8,
  boxSizing: 'border-box',
  display: 'grid',
  gap: '0.3rem',
  gridAutoRows: `minmax(${timelineCardMinHeight}, 1fr)`,
  gridTemplateColumns: timelineGridTemplateColumns,
  height: '100%',
  minHeight: timelineRowMinHeight,
  minWidth: timelineLaneMinWidth,
  padding: '0.35rem',
  width: '100%'
};

const timelineCardFrameStyle: CSSProperties = {
  alignItems: 'stretch',
  alignSelf: 'stretch',
  background: '#e8f6f8',
  border: '1px solid #8bd1de',
  borderRadius: 6,
  boxSizing: 'border-box',
  color: '#12212b',
  display: 'flex',
  gap: '0.35rem',
  height: '100%',
  minHeight: timelineCardMinHeight,
  minWidth: '11rem',
  overflow: 'visible',
  padding: 0,
  position: 'relative',
  whiteSpace: 'nowrap'
};

const timelineCardMainButtonStyle: CSSProperties = {
  alignItems: 'stretch',
  background: 'transparent',
  border: 0,
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flex: '1 1 auto',
  gap: '0.35rem',
  height: '100%',
  minHeight: timelineCardMinHeight,
  minWidth: '11rem',
  overflow: 'hidden',
  padding: '0 0 0 0',
  textAlign: 'left'
};

const timelineCardEditButtonStyle: CSSProperties = {
  alignSelf: 'center',
  background: '#ffffff',
  border: '1px solid #cbe3e8',
  borderRadius: 4,
  color: '#176b5b',
  cursor: 'pointer',
  flex: '0 0 auto',
  fontSize: '0.68rem',
  fontWeight: 800,
  height: '1.45rem',
  lineHeight: 1,
  marginRight: '0.35rem',
  padding: '0 0.35rem'
};

function getTimelineCardRailStyle(card: DispatchAppointmentCard): CSSProperties {
  return {
    alignSelf: 'stretch',
    background: card.needsOfficeReview ? '#d92d20' : getAppointmentStatusColor(card.status),
    borderRadius: 999,
    flex: '0 0 0.25rem'
  };
}

function getAppointmentStatusColor(status: DispatchAppointmentCard['status']): string {
  switch (status) {
    case 'confirmed':
    case 'dispatched':
    case 'onTheWay':
      return '#2563eb';
    case 'arrived':
    case 'working':
      return '#176b5b';
    case 'finished':
      return '#64748b';
    case 'noAnswer':
      return '#b45309';
    default:
      return '#0ea5c4';
  }
}

const timelineCardBodyStyle: CSSProperties = {
  alignContent: 'center',
  boxSizing: 'border-box',
  display: 'grid',
  gap: '0.25rem',
  gridTemplateRows: `${timelineCardTextLineHeight} ${timelineCardTextLineHeight}`,
  height: '100%',
  minWidth: 0,
  padding: '0.45rem 0'
};

const timelineCardTitleRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: '0.35rem',
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  minWidth: 0
};

const timelineJobChipStyle: CSSProperties = {
  alignItems: 'center',
  background: '#ffffff',
  borderRadius: 4,
  color: '#176b5b',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '0.68rem',
  fontWeight: 800,
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  padding: '0 0.3rem'
};

const timelineReviewChipStyle: CSSProperties = {
  alignItems: 'center',
  background: '#fde7e5',
  borderRadius: 4,
  color: '#b42318',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '0.68rem',
  fontWeight: 800,
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  padding: '0 0.3rem'
};

const timelineCardLocationStyle: CSSProperties = {
  display: 'block',
  flex: '1 1 auto',
  fontSize: '0.78rem',
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const timelineCardAddressStyle: CSSProperties = {
  color: '#475569',
  display: 'block',
  maxWidth: '100%',
  fontSize: '0.72rem',
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

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

const emptyTimelineStyle: CSSProperties = {
  alignSelf: 'center',
  color: '#7b8794',
  gridColumn: '1 / span 4'
};
