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
import {
  DispatchCardButton,
  type DispatchContextMenuPosition,
  type DispatchMoveState,
  type DispatchResizeState,
  type DispatchTimelineDragState
} from './dispatch-timeline-card';
import type { DispatchScheduleDraft, DispatchScheduleEditorState } from './dispatch-schedule-types';
import {
  timelineCardMinHeight,
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
  buildDispatchMoveDraft,
  buildDispatchResizeDraft,
  clampDispatchMoveStartMinutes,
  clampDispatchResizeEndMinutes,
  getDispatchMoveDurationMinutes,
  getDispatchResizeBaseEndMinutes,
  parseDispatchTimeToMinutes
} from './dispatch-timeline-time';

export { formatDispatchCardAddress } from './dispatch-timeline-card';
export type { DispatchContextMenuPosition } from './dispatch-timeline-card';

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
  onScheduleUpdate?: (card: DispatchAppointmentCard, draft: DispatchScheduleDraft) => Promise<void>;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

const dispatchMoveThresholdPixels = 6;

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
  onScheduleUpdate,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchTimelineRowProps) {
  const [dragState, setDragState] = useState<DispatchTimelineDragState | null>(null);
  const dragStateRef = useRef<DispatchTimelineDragState | null>(null);
  const suppressNextOpenRef = useRef(false);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!dragState || dragState.mode !== 'dragging') {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      setDragState((current) => {
        if (!current || current.mode !== 'dragging') {
          return current;
        }

        const slotDelta = Math.round((event.clientX - current.pointerStartX) / current.slotWidth);
        if (current.kind === 'move') {
          const durationMinutes = current.baseEndMinutes - current.baseStartMinutes;
          const hasMoved =
            current.hasMoved ||
            Math.abs(event.clientX - current.pointerStartX) >= dispatchMoveThresholdPixels;

          if (!hasMoved) {
            return current;
          }

          const previewStartMinutes = clampDispatchMoveStartMinutes(
            current.baseStartMinutes + slotDelta * timelineSlotMinutes,
            durationMinutes,
            timelineStartMinutes,
            timelineEndMinutes
          );

          return {
            ...current,
            hasMoved,
            previewStartMinutes,
            previewEndMinutes: previewStartMinutes + durationMinutes
          };
        }

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
      const current = dragStateRef.current;

      if (current) {
        if (current.kind === 'move' && current.hasMoved) {
          suppressNextOpenRef.current = true;
        }

        void commitTimelineDrag(current);
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState?.appointmentId, dragState?.mode]);

  function handleOpenCardDetail(card: DispatchAppointmentCard) {
    if (suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false;
      return;
    }

    onOpenJobDetail?.(card.jobId, card.appointmentId);
  }

  function handleResizeStart(
    card: DispatchAppointmentCard,
    event: ReactPointerEvent<HTMLButtonElement>,
    cardFrameElement: HTMLDivElement | null
  ) {
    if (!onScheduleUpdate) {
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

    setDragState({
      kind: 'resize',
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

  function handleMoveStart(
    card: DispatchAppointmentCard,
    event: ReactPointerEvent<HTMLButtonElement>,
    cardFrameElement: HTMLDivElement | null
  ) {
    if (!onScheduleUpdate || event.button !== 0) {
      return;
    }

    const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);

    if (!card.scheduledDate || startMinutes === null || startMinutes >= timelineEndMinutes) {
      return;
    }

    const endMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
    const durationMinutes = getDispatchMoveDurationMinutes(
      startMinutes,
      endMinutes,
      timelineEndMinutes
    );

    if (durationMinutes <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);

    setDragState({
      kind: 'move',
      appointmentId: card.appointmentId,
      baseStartMinutes: startMinutes,
      baseEndMinutes: startMinutes + durationMinutes,
      previewStartMinutes: startMinutes,
      previewEndMinutes: startMinutes + durationMinutes,
      pointerStartX: event.clientX,
      slotWidth: getTimelineSlotWidth(cardFrameElement),
      mode: 'dragging',
      errorMessage: null,
      hasMoved: false
    });
  }

  async function commitTimelineDrag(state: DispatchTimelineDragState) {
    if (state.kind === 'move') {
      await commitMove(state);
      return;
    }

    await commitResize(state);
  }

  async function commitResize(state: DispatchResizeState) {
    if (!onScheduleUpdate) {
      setDragState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card) {
      setDragState(null);
      return;
    }

    const currentEndMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
    const didResize =
      currentEndMinutes === null
        ? state.previewEndMinutes !== state.baseEndMinutes
        : state.previewEndMinutes !== currentEndMinutes;

    if (!didResize) {
      setDragState(null);
      return;
    }

    setDragState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleUpdate(card, buildDispatchResizeDraft(card, state.previewEndMinutes));
      setDragState(null);
    } catch (error) {
      setDragState((current) =>
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

  async function commitMove(state: DispatchMoveState) {
    if (!onScheduleUpdate) {
      setDragState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card) {
      setDragState(null);
      return;
    }

    const didMove =
      state.hasMoved &&
      (state.previewStartMinutes !== state.baseStartMinutes ||
        state.previewEndMinutes !== state.baseEndMinutes);

    if (!didMove) {
      setDragState(null);
      return;
    }

    setDragState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleUpdate(
        card,
        buildDispatchMoveDraft(card, state.previewStartMinutes, state.previewEndMinutes)
      );
      setDragState(null);
    } catch (error) {
      setDragState((current) =>
        current?.appointmentId === state.appointmentId
          ? {
              ...current,
              mode: 'error',
              errorMessage:
                error instanceof Error ? error.message : 'Unable to update appointment time.'
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
              dragState={dragState?.appointmentId === card.appointmentId ? dragState : null}
              placementStyle={getTimelineCardPlacementStyle(
                card,
                index,
                dragState?.appointmentId === card.appointmentId
                  ? getDragPlacementPreview(dragState)
                  : undefined
              )}
              technicians={technicians}
              onOpenJobDetail={() => handleOpenCardDetail(card)}
              onOpenScheduleEditor={onOpenScheduleEditor}
              onOpenContextMenu={onOpenContextMenu}
              onMoveStart={onScheduleUpdate ? handleMoveStart : undefined}
              onResizeStart={onScheduleUpdate ? handleResizeStart : undefined}
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
  preview?: { startMinutes?: number; endMinutes?: number }
): CSSProperties {
  const startMinutes = preview?.startMinutes ?? parseDispatchTimeToMinutes(card.scheduledStartTime);
  const endMinutes = preview?.endMinutes ?? parseDispatchTimeToMinutes(card.scheduledEndTime);

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

function getDragPlacementPreview(dragState: DispatchTimelineDragState): {
  startMinutes?: number;
  endMinutes?: number;
} {
  if (dragState.kind === 'move') {
    return {
      startMinutes: dragState.previewStartMinutes,
      endMinutes: dragState.previewEndMinutes
    };
  }

  return {
    endMinutes: dragState.previewEndMinutes
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

const emptyTimelineStyle: CSSProperties = {
  alignSelf: 'center',
  color: '#7b8794',
  gridColumn: '1 / span 4'
};
