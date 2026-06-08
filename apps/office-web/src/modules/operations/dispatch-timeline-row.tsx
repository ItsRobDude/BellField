'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import {
  DispatchCardButton,
  type DispatchAssignmentState,
  type DispatchContextMenuPosition,
  type DispatchMoveState,
  type DispatchResizeState,
  type DispatchTimelineDragState
} from './dispatch-timeline-card';
import {
  buildDispatchOverlapLookup,
  getDispatchCardTimeRange,
  hasDispatchOverlapWithCards,
  type DispatchTimeRange
} from './dispatch-overlap-utils';
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
import { timelineLaneCellStyle } from './dispatch-timeline-shared-styles';
import {
  buildDispatchMoveDraft,
  buildDispatchReassignmentDraft,
  buildDispatchResizeDraft,
  clampDispatchMoveStartMinutes,
  clampDispatchResizeEndMinutes,
  getDispatchMoveDurationMinutes,
  getDispatchResizeBaseEndMinutes,
  parseDispatchTimeToMinutes
} from './dispatch-timeline-time';

export { formatDispatchCardAddress } from './dispatch-timeline-card';
export type { DispatchContextMenuPosition } from './dispatch-timeline-card';

export type DispatchAssignmentTarget = {
  technicianId: string;
  label: string;
};

type DispatchTimelineRowProps = {
  label: string;
  sublabel: string;
  ariaLabel: string;
  assignmentTarget: DispatchAssignmentTarget;
  activeAssignmentTargetId: string | null;
  cards: DispatchAppointmentCard[];
  showScheduleConflicts?: boolean;
  activeScheduleEditor: DispatchScheduleEditorState | null;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail?: (jobId: string, appointmentId?: string) => void;
  onOpenScheduleEditor?: (card: DispatchAppointmentCard) => void;
  onOpenContextMenu?: (
    card: DispatchAppointmentCard,
    position: DispatchContextMenuPosition
  ) => void;
  onScheduleUpdate?: (card: DispatchAppointmentCard, draft: DispatchScheduleDraft) => Promise<void>;
  getAssignmentTargetCards?: (technicianId: string) => DispatchAppointmentCard[];
  onAssignmentTargetPreviewChange: (target: DispatchAssignmentTarget | null) => void;
  onScheduleDraftChange: (patch: Partial<DispatchScheduleDraft>) => void;
  onScheduleEditorCancel: () => void;
  onScheduleEditorSave: () => void;
};

const dispatchMoveThresholdPixels = 6;
const dispatchAssignmentThresholdPixels = 16;
const dispatchOverlapWarningText = 'Overlaps another appointment';

export function DispatchTimelineRow({
  label,
  sublabel,
  ariaLabel,
  assignmentTarget,
  activeAssignmentTargetId,
  cards,
  showScheduleConflicts = true,
  activeScheduleEditor,
  technicians,
  onOpenJobDetail,
  onOpenScheduleEditor,
  onOpenContextMenu,
  onScheduleUpdate,
  getAssignmentTargetCards,
  onAssignmentTargetPreviewChange,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchTimelineRowProps) {
  const [dragState, setDragState] = useState<DispatchTimelineDragState | null>(null);
  const dragStateRef = useRef<DispatchTimelineDragState | null>(null);
  const suppressNextOpenRef = useRef(false);
  const overlapLookup = useMemo(() => buildDispatchOverlapLookup(cards), [cards]);
  const isAssignmentTargetActive =
    activeAssignmentTargetId !== null && activeAssignmentTargetId === assignmentTarget.technicianId;

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  function setActiveDragState(state: DispatchTimelineDragState | null) {
    dragStateRef.current = state;
    setDragState(state);
  }

  useEffect(() => {
    if (!dragState || dragState.mode !== 'dragging') {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const current = dragStateRef.current;

      if (!current || current.mode !== 'dragging') {
        return;
      }

      const next = getNextDragState(current, event);

      if (next !== current) {
        dragStateRef.current = next;
        setDragState(next);
      }

      onAssignmentTargetPreviewChange(
        next.kind === 'assignment' && next.targetTechnicianId !== null
          ? { technicianId: next.targetTechnicianId, label: next.targetLabel ?? 'Unassigned' }
          : null
      );
    }

    function handlePointerUp() {
      const current = dragStateRef.current;

      if (current) {
        if (
          (current.kind === 'move' && current.hasMoved) ||
          (current.kind === 'assignment' && current.hasMoved)
        ) {
          suppressNextOpenRef.current = true;
        }

        onAssignmentTargetPreviewChange(null);
        void commitTimelineDrag(current);
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onAssignmentTargetPreviewChange(null);
    };
  }, [dragState?.appointmentId, dragState?.mode, onAssignmentTargetPreviewChange]);

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

    setActiveDragState({
      kind: 'resize',
      appointmentId: card.appointmentId,
      startMinutes,
      baseEndMinutes,
      previewEndMinutes: baseEndMinutes,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      slotWidth: getTimelineSlotWidth(cardFrameElement),
      mode: 'dragging',
      errorMessage: null,
      overlapWarning: getOverlapWarningForRange(card.appointmentId, {
        startMinutes,
        endMinutes: baseEndMinutes
      })
    });
  }

  function handleCardDragStart(
    card: DispatchAppointmentCard,
    event: ReactPointerEvent<HTMLButtonElement>,
    cardFrameElement: HTMLDivElement | null
  ) {
    if (!onScheduleUpdate || event.button !== 0) {
      return;
    }

    const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);
    const endMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
    const canTimeMove =
      Boolean(card.scheduledDate) && startMinutes !== null && startMinutes < timelineEndMinutes;
    const durationMinutes = canTimeMove
      ? getDispatchMoveDurationMinutes(startMinutes, endMinutes, timelineEndMinutes)
      : 0;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    setActiveDragState({
      kind: 'pending',
      appointmentId: card.appointmentId,
      sourceTechnicianId: card.technicianId ?? '',
      canTimeMove: canTimeMove && durationMinutes > 0,
      baseStartMinutes: canTimeMove && durationMinutes > 0 ? startMinutes : null,
      baseEndMinutes: canTimeMove && durationMinutes > 0 ? startMinutes + durationMinutes : null,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      slotWidth: getTimelineSlotWidth(cardFrameElement),
      mode: 'dragging',
      errorMessage: null,
      overlapWarning: null
    });
  }

  function getNextDragState(
    current: DispatchTimelineDragState,
    event: PointerEvent
  ): DispatchTimelineDragState {
    const deltaX = event.clientX - current.pointerStartX;
    const deltaY = event.clientY - current.pointerStartY;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    if (current.kind === 'pending') {
      if (
        current.canTimeMove &&
        absoluteDeltaX >= dispatchMoveThresholdPixels &&
        absoluteDeltaX > absoluteDeltaY &&
        current.baseStartMinutes !== null &&
        current.baseEndMinutes !== null
      ) {
        return getMovedDragState(
          {
            ...current,
            kind: 'move',
            baseStartMinutes: current.baseStartMinutes,
            baseEndMinutes: current.baseEndMinutes,
            previewStartMinutes: current.baseStartMinutes,
            previewEndMinutes: current.baseEndMinutes,
            hasMoved: true
          },
          event.clientX
        );
      }

      if (absoluteDeltaY >= dispatchAssignmentThresholdPixels && absoluteDeltaY > absoluteDeltaX) {
        const target = getAssignmentTargetAtPoint(
          event.clientX,
          event.clientY,
          current.sourceTechnicianId
        );

        return {
          ...current,
          kind: 'assignment',
          targetTechnicianId: target?.technicianId ?? null,
          targetLabel: target?.label ?? null,
          hasMoved: true,
          overlapWarning: getAssignmentOverlapWarning(
            current.appointmentId,
            target?.technicianId ?? null
          )
        };
      }

      return current;
    }

    if (current.kind === 'move') {
      const hasMoved =
        current.hasMoved ||
        Math.abs(event.clientX - current.pointerStartX) >= dispatchMoveThresholdPixels;

      if (!hasMoved) {
        return current;
      }

      return getMovedDragState({ ...current, hasMoved }, event.clientX);
    }

    if (current.kind === 'assignment') {
      const target = getAssignmentTargetAtPoint(
        event.clientX,
        event.clientY,
        current.sourceTechnicianId
      );

      return {
        ...current,
        targetTechnicianId: target?.technicianId ?? null,
        targetLabel: target?.label ?? null,
        overlapWarning: getAssignmentOverlapWarning(
          current.appointmentId,
          target?.technicianId ?? null
        )
      };
    }

    const slotDelta = Math.round((event.clientX - current.pointerStartX) / current.slotWidth);
    const previewEndMinutes = clampDispatchResizeEndMinutes(
      current.startMinutes,
      current.baseEndMinutes + slotDelta * timelineSlotMinutes,
      timelineEndMinutes
    );

    return {
      ...current,
      previewEndMinutes,
      overlapWarning: getOverlapWarningForRange(current.appointmentId, {
        startMinutes: current.startMinutes,
        endMinutes: previewEndMinutes
      })
    };
  }

  function getMovedDragState(state: DispatchMoveState, clientX: number): DispatchMoveState {
    const slotDelta = Math.round((clientX - state.pointerStartX) / state.slotWidth);
    const durationMinutes = state.baseEndMinutes - state.baseStartMinutes;
    const previewStartMinutes = clampDispatchMoveStartMinutes(
      state.baseStartMinutes + slotDelta * timelineSlotMinutes,
      durationMinutes,
      timelineStartMinutes,
      timelineEndMinutes
    );

    return {
      ...state,
      previewStartMinutes,
      previewEndMinutes: previewStartMinutes + durationMinutes,
      overlapWarning: getOverlapWarningForRange(state.appointmentId, {
        startMinutes: previewStartMinutes,
        endMinutes: previewStartMinutes + durationMinutes
      })
    };
  }

  function getOverlapWarningForRange(
    appointmentId: string,
    range: DispatchTimeRange | null,
    targetCards = cards
  ): string | null {
    return hasDispatchOverlapWithCards(targetCards, appointmentId, range)
      ? dispatchOverlapWarningText
      : null;
  }

  function getAssignmentOverlapWarning(
    appointmentId: string,
    targetTechnicianId: string | null
  ): string | null {
    if (!targetTechnicianId) {
      return null;
    }

    const card = cards.find((candidate) => candidate.appointmentId === appointmentId);

    if (!card) {
      return null;
    }

    const targetCards = getAssignmentTargetCards?.(targetTechnicianId) ?? [];

    return getOverlapWarningForRange(appointmentId, getDispatchCardTimeRange(card), targetCards);
  }

  async function commitTimelineDrag(state: DispatchTimelineDragState) {
    if (state.kind === 'pending') {
      setDragState(null);
      return;
    }

    if (state.kind === 'assignment') {
      await commitAssignment(state);
      return;
    }

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

  async function commitAssignment(state: DispatchAssignmentState) {
    if (!onScheduleUpdate) {
      setDragState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card || state.targetTechnicianId === null) {
      setDragState(null);
      return;
    }

    if (state.targetTechnicianId === state.sourceTechnicianId) {
      setDragState(null);
      return;
    }

    setDragState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleUpdate(card, buildDispatchReassignmentDraft(card, state.targetTechnicianId));
      setDragState(null);
    } catch (error) {
      setDragState((current) =>
        current?.appointmentId === state.appointmentId
          ? {
              ...current,
              mode: 'error',
              errorMessage:
                error instanceof Error ? error.message : 'Unable to update appointment assignment.'
            }
          : current
      );
    }
  }

  return (
    <section
      style={timelineRowStyle}
      aria-label={ariaLabel}
      data-dispatch-assignment-target-id={assignmentTarget.technicianId}
      data-dispatch-assignment-target-label={assignmentTarget.label}
    >
      <div
        style={{
          ...timelineRowLabelStyle,
          ...(isAssignmentTargetActive ? timelineAssignmentTargetStyle : null)
        }}
      >
        <strong>{label}</strong>
        <span style={timelineRowSublabelStyle}>{sublabel}</span>
      </div>
      <div style={timelineLaneCellStyle}>
        <div
          style={{
            ...timelineLaneStyle,
            ...(isAssignmentTargetActive ? timelineAssignmentTargetStyle : null)
          }}
        >
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
              hasScheduleConflict={
                showScheduleConflicts && Boolean(overlapLookup.get(card.appointmentId)?.size)
              }
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
              onDragStart={onScheduleUpdate ? handleCardDragStart : undefined}
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

function getDragPlacementPreview(dragState: DispatchTimelineDragState):
  | {
      startMinutes?: number;
      endMinutes?: number;
    }
  | undefined {
  if (dragState.kind === 'move') {
    return {
      startMinutes: dragState.previewStartMinutes,
      endMinutes: dragState.previewEndMinutes
    };
  }

  if (dragState.kind === 'resize') {
    return {
      endMinutes: dragState.previewEndMinutes
    };
  }

  return undefined;
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

function getAssignmentTargetAtPoint(
  clientX: number,
  clientY: number,
  sourceTechnicianId: string
): DispatchAssignmentTarget | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return null;
  }

  const element = document.elementFromPoint(clientX, clientY);
  const targetElement = element?.closest<HTMLElement>('[data-dispatch-assignment-target-id]');

  if (!targetElement) {
    return null;
  }

  const technicianId = targetElement.dataset.dispatchAssignmentTargetId ?? '';

  if (technicianId === sourceTechnicianId) {
    return null;
  }

  return {
    technicianId,
    label:
      targetElement.dataset.dispatchAssignmentTargetLabel ??
      (technicianId ? 'Technician' : 'Unassigned')
  };
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

const timelineAssignmentTargetStyle: CSSProperties = {
  background: '#eefaf5',
  borderColor: '#176b5b',
  boxShadow: '0 0 0 2px rgba(23, 107, 91, 0.16)'
};

const emptyTimelineStyle: CSSProperties = {
  alignSelf: 'center',
  color: '#7b8794',
  gridColumn: '1 / span 4'
};
