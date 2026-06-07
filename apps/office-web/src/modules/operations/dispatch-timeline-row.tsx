'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import { appointmentStatusLabels } from './job-work-types';
import { DispatchSchedulePopover } from './dispatch-schedule-popover';
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
import {
  buildDispatchResizeDraft,
  clampDispatchResizeEndMinutes,
  formatDispatchResizePreview,
  getDispatchResizeBaseEndMinutes,
  parseDispatchTimeToMinutes
} from './dispatch-timeline-time';

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
  onScheduleResize?: (card: DispatchAppointmentCard, draft: DispatchScheduleDraft) => Promise<void>;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

type DispatchResizeState = {
  appointmentId: string;
  startMinutes: number;
  baseEndMinutes: number;
  previewEndMinutes: number;
  pointerStartX: number;
  slotWidth: number;
  mode: 'dragging' | 'saving' | 'error';
  errorMessage: string | null;
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
  onScheduleResize,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchTimelineRowProps) {
  const [resizeState, setResizeState] = useState<DispatchResizeState | null>(null);
  const resizeStateRef = useRef<DispatchResizeState | null>(null);

  useEffect(() => {
    resizeStateRef.current = resizeState;
  }, [resizeState]);

  useEffect(() => {
    if (!resizeState || resizeState.mode !== 'dragging') {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      setResizeState((current) => {
        if (!current || current.mode !== 'dragging') {
          return current;
        }

        const slotDelta = Math.round((event.clientX - current.pointerStartX) / current.slotWidth);
        const previewEndMinutes = clampDispatchResizeEndMinutes(
          current.startMinutes,
          current.baseEndMinutes + slotDelta * timelineSlotMinutes,
          timelineEndMinutes
        );

        return {
          ...current,
          previewEndMinutes
        };
      });
    }

    function handlePointerUp() {
      const current = resizeStateRef.current;

      if (current) {
        void commitResize(current);
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizeState?.appointmentId, resizeState?.mode]);

  function handleResizeStart(
    card: DispatchAppointmentCard,
    event: ReactPointerEvent<HTMLButtonElement>,
    cardFrameElement: HTMLDivElement | null
  ) {
    if (!onScheduleResize) {
      return;
    }

    const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);

    if (!card.scheduledDate || startMinutes === null || startMinutes >= timelineEndMinutes) {
      return;
    }

    const endMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
    const baseEndMinutes = getDispatchResizeBaseEndMinutes(
      startMinutes,
      endMinutes,
      timelineEndMinutes
    );

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    setResizeState({
      appointmentId: card.appointmentId,
      startMinutes,
      baseEndMinutes,
      previewEndMinutes: baseEndMinutes,
      pointerStartX: event.clientX,
      slotWidth: getTimelineSlotWidth(cardFrameElement),
      mode: 'dragging',
      errorMessage: null
    });
  }

  async function commitResize(state: DispatchResizeState) {
    if (!onScheduleResize) {
      setResizeState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card) {
      setResizeState(null);
      return;
    }

    const currentEndMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
    const didResize =
      currentEndMinutes === null
        ? state.previewEndMinutes !== state.baseEndMinutes
        : state.previewEndMinutes !== currentEndMinutes;

    if (!didResize) {
      setResizeState(null);
      return;
    }

    setResizeState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleResize(card, buildDispatchResizeDraft(card, state.previewEndMinutes));
      setResizeState(null);
    } catch (error) {
      setResizeState((current) =>
        current?.appointmentId === state.appointmentId
          ? {
              ...current,
              mode: 'error',
              errorMessage:
                error instanceof Error ? error.message : 'Unable to update appointment duration.'
            }
          : current
      );
    }
  }

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
              resizeState={resizeState?.appointmentId === card.appointmentId ? resizeState : null}
              placementStyle={getTimelineCardPlacementStyle(
                card,
                index,
                resizeState?.appointmentId === card.appointmentId
                  ? resizeState.previewEndMinutes
                  : undefined
              )}
              technicians={technicians}
              onOpenJobDetail={() => onOpenJobDetail?.(card.jobId, card.appointmentId)}
              onOpenScheduleEditor={onOpenScheduleEditor}
              onOpenContextMenu={onOpenContextMenu}
              onResizeStart={onScheduleResize ? handleResizeStart : undefined}
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
  resizeState: DispatchResizeState | null;
  placementStyle?: CSSProperties;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail: () => void;
  onOpenScheduleEditor?: (card: DispatchAppointmentCard) => void;
  onOpenContextMenu?: (
    card: DispatchAppointmentCard,
    position: DispatchContextMenuPosition
  ) => void;
  onResizeStart?: (
    card: DispatchAppointmentCard,
    event: ReactPointerEvent<HTMLButtonElement>,
    cardFrameElement: HTMLDivElement | null
  ) => void;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

function DispatchCardButton({
  card,
  activeScheduleEditor,
  resizeState,
  placementStyle,
  technicians,
  onOpenJobDetail,
  onOpenScheduleEditor,
  onOpenContextMenu,
  onResizeStart,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchCardButtonProps) {
  const cardFrameRef = useRef<HTMLDivElement | null>(null);
  const address = formatDispatchCardAddress(card);
  const statusLabel = appointmentStatusLabels[card.status];
  const reviewLabel = card.needsOfficeReview ? ', review needed' : '';
  const canResize = Boolean(
    onResizeStart &&
      card.scheduledDate &&
      parseDispatchTimeToMinutes(card.scheduledStartTime) !== null
  );

  return (
    <div
      ref={cardFrameRef}
      style={{
        ...timelineCardFrameStyle,
        ...(resizeState ? timelineCardResizingStyle : null),
        ...placementStyle
      }}
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
      {resizeState ? (
        <span role="status" style={resizeStatusStyle}>
          {resizeState.mode === 'saving'
            ? 'Saving...'
            : (resizeState.errorMessage ??
              formatDispatchResizePreview(resizeState.startMinutes, resizeState.previewEndMinutes))}
        </span>
      ) : null}
      {canResize ? (
        <button
          type="button"
          aria-label={`Resize job ${card.jobNumber} duration`}
          title="Drag to change expected end time"
          style={timelineResizeHandleStyle}
          onPointerDown={(event) => onResizeStart?.(card, event, cardFrameRef.current)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
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
  index: number,
  previewEndMinutes?: number
): CSSProperties {
  const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);
  const endMinutes = previewEndMinutes ?? parseDispatchTimeToMinutes(card.scheduledEndTime);

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

function getTimelineSlotWidth(cardFrameElement: HTMLDivElement | null): number {
  const laneElement = cardFrameElement?.parentElement;
  const laneRect = laneElement?.getBoundingClientRect();

  if (!laneRect?.width) {
    return 24;
  }

  const rootFontSize = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize
  );
  const untimedColumnWidth = (Number.isFinite(rootFontSize) ? rootFontSize : 16) * 12;
  const timeAreaWidth = Math.max(1, laneRect.width - untimedColumnWidth);

  return Math.max(1, timeAreaWidth / timelineSlotCount);
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

const timelineCardResizingStyle: CSSProperties = {
  boxShadow: '0 0 0 2px rgba(23, 107, 91, 0.18)',
  outline: '1px solid #176b5b'
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

const timelineResizeHandleStyle: CSSProperties = {
  alignSelf: 'stretch',
  background: 'linear-gradient(90deg, transparent, rgba(23, 107, 91, 0.18))',
  border: 0,
  borderBottomRightRadius: 5,
  borderTopRightRadius: 5,
  bottom: 0,
  cursor: 'ew-resize',
  padding: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  width: '0.55rem',
  zIndex: 3
};

const resizeStatusStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd8d6',
  borderRadius: 4,
  bottom: 'calc(100% + 0.2rem)',
  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.14)',
  color: '#12212b',
  fontSize: '0.72rem',
  fontWeight: 800,
  left: '0.45rem',
  padding: '0.18rem 0.35rem',
  position: 'absolute',
  zIndex: 6
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

const emptyTimelineStyle: CSSProperties = {
  alignSelf: 'center',
  color: '#7b8794',
  gridColumn: '1 / span 4'
};
