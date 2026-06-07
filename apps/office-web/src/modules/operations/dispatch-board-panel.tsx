'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildDispatchBoardModel,
  type DispatchAppointmentCard,
  type DispatchBoardModel
} from './dispatch-board-data';
import { DispatchDatePicker, getDateInputValue } from './dispatch-date-picker';
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
  onAppointmentScheduleUpdate?: (
    jobId: string,
    appointmentId: string,
    draft: DispatchScheduleDraft
  ) => Promise<void>;
  isRefreshing?: boolean;
  lastRefreshedAt?: string | null;
  onRefresh?: () => Promise<void>;
};

type DispatchScheduleEditorState = {
  appointmentId: string;
  draft: DispatchScheduleDraft;
  errorMessage: string | null;
  isSaving: boolean;
};

export function DispatchBoardPanel({
  dispatchBoard,
  viewDate,
  onViewDateChange,
  onOpenJobDetail,
  onAppointmentScheduleUpdate,
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
  const [scheduleEditor, setScheduleEditor] = useState<DispatchScheduleEditorState | null>(null);

  useEffect(() => {
    if (scheduleEditor && !model.cardLookup.has(scheduleEditor.appointmentId)) {
      setScheduleEditor(null);
    }
  }, [model.cardLookup, scheduleEditor]);

  function handleOpenScheduleEditor(card: DispatchAppointmentCard) {
    setScheduleEditor({
      appointmentId: card.appointmentId,
      draft: createDispatchScheduleDraft(card, effectiveViewDate),
      errorMessage: null,
      isSaving: false
    });
  }

  function handleScheduleDraftChange(patch: Partial<DispatchScheduleDraft>) {
    setScheduleEditor((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              ...patch
            },
            errorMessage: null
          }
        : current
    );
  }

  async function handleSaveScheduleEditor() {
    if (!scheduleEditor || !onAppointmentScheduleUpdate) {
      return;
    }

    const card = model.cardLookup.get(scheduleEditor.appointmentId);

    if (!card) {
      setScheduleEditor(null);
      return;
    }

    setScheduleEditor((current) => (current ? { ...current, isSaving: true } : current));

    try {
      await onAppointmentScheduleUpdate(card.jobId, card.appointmentId, scheduleEditor.draft);
      setScheduleEditor(null);
    } catch (error) {
      setScheduleEditor((current) =>
        current
          ? {
              ...current,
              errorMessage:
                error instanceof Error ? error.message : 'Unable to update appointment scheduling.',
              isSaving: false
            }
          : current
      );
    }
  }

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
              sublabel="Needs assignment"
              ariaLabel="Unassigned appointments"
              cards={model.unassignedQueue}
              activeScheduleEditor={scheduleEditor}
              technicians={dispatchBoard.technicians}
              onOpenJobDetail={onOpenJobDetail}
              onOpenScheduleEditor={
                onAppointmentScheduleUpdate ? handleOpenScheduleEditor : undefined
              }
              onScheduleDraftChange={handleScheduleDraftChange}
              onScheduleEditorCancel={() => setScheduleEditor(null)}
              onScheduleEditorSave={handleSaveScheduleEditor}
            />
            {model.technicianRows.map((row) => (
              <DispatchTimelineRow
                key={row.technicianId}
                label={row.technicianName}
                sublabel={formatTechnicianRowSublabel(row.roleId)}
                ariaLabel={`Appointments for ${row.technicianName}`}
                cards={row.cards}
                activeScheduleEditor={scheduleEditor}
                technicians={dispatchBoard.technicians}
                onOpenJobDetail={onOpenJobDetail}
                onOpenScheduleEditor={
                  onAppointmentScheduleUpdate ? handleOpenScheduleEditor : undefined
                }
                onScheduleDraftChange={handleScheduleDraftChange}
                onScheduleEditorCancel={() => setScheduleEditor(null)}
                onScheduleEditorSave={handleSaveScheduleEditor}
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
  sublabel: string;
  ariaLabel: string;
  cards: DispatchAppointmentCard[];
  activeScheduleEditor: DispatchScheduleEditorState | null;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail?: DispatchBoardPanelProps['onOpenJobDetail'];
  onOpenScheduleEditor?: (card: DispatchAppointmentCard) => void;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

function DispatchTimelineRow({
  label,
  sublabel,
  ariaLabel,
  cards,
  activeScheduleEditor,
  technicians,
  onOpenJobDetail,
  onOpenScheduleEditor,
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
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchCardButtonProps) {
  const address = formatDispatchCardAddress(card);
  const statusLabel = appointmentStatusLabels[card.status];
  const reviewLabel = card.needsOfficeReview ? ', review needed' : '';

  return (
    <div style={{ ...timelineCardFrameStyle, ...placementStyle }}>
      <button
        type="button"
        onClick={onOpenJobDetail}
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

function formatDispatchCardAddress(card: DispatchAppointmentCard): string {
  const cityState = [card.locationCity, card.locationState].filter(Boolean).join(', ');

  return [card.locationAddressLine1, cityState].filter(Boolean).join(', ');
}

function createDispatchScheduleDraft(
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

function formatTechnicianRowSublabel(roleId: string): string {
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
const timelineLaneMinWidth = '96rem';
const timelineColumnGap = '0.75rem';
const timelineRowMinHeight = '4.85rem';
const timelineCardMinHeight = '3.8rem';
const timelineCardTextLineHeight = '1.1rem';

const dispatchTimelineViewportStyle: CSSProperties = {
  marginTop: '0.75rem',
  overflowX: 'auto',
  paddingBottom: '0.35rem'
};

const dispatchTimelineContentStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  minWidth: `calc(${timelineLabelWidth} + ${timelineColumnGap} + ${timelineLaneMinWidth})`,
  width: '100%'
};

const dispatchBoardStyle: CSSProperties = {
  display: 'grid',
  gap: '0.45rem'
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

const timelineLaneCellStyle: CSSProperties = {
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
