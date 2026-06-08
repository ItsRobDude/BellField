'use client';

import { useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import { DispatchCardButton, type DispatchContextMenuPosition } from './dispatch-timeline-card';
import {
  buildDispatchOverlapLookup,
  getDispatchCardTimeRange,
  hasDispatchOverlapWithCards,
  type DispatchTimeRange
} from './dispatch-overlap-utils';
import type { DispatchScheduleDraft, DispatchScheduleEditorState } from './dispatch-schedule-types';
import {
  dispatchOverlapWarningText,
  getDispatchDragPlacementPreview,
  getNextDispatchDragState,
  type DispatchAssignmentState,
  type DispatchAssignmentTarget,
  type DispatchMoveState,
  type DispatchResizeState,
  type DispatchTimelineDragState
} from './dispatch-timeline-drag-state';
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
  getDispatchMoveDurationMinutes,
  getDispatchResizeBaseEndMinutes,
  parseDispatchTimeToMinutes
} from './dispatch-timeline-time';
import { useDispatchTimelineDrag } from './use-dispatch-timeline-drag';

export { formatDispatchCardAddress } from './dispatch-timeline-card';
export type { DispatchContextMenuPosition } from './dispatch-timeline-card';
export type { DispatchAssignmentTarget } from './dispatch-timeline-drag-state';

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
  const overlapLookup = useMemo(() => buildDispatchOverlapLookup(cards), [cards]);
  const isAssignmentTargetActive =
    activeAssignmentTargetId !== null && activeAssignmentTargetId === assignmentTarget.technicianId;
  const { dragState, setActiveDragState, consumeCardOpenSuppression } = useDispatchTimelineDrag({
    getNextDragState,
    onAssignmentTargetPreviewChange,
    onDragEnd: (state) => {
      void commitTimelineDrag(state);
    }
  });

  function handleOpenCardDetail(card: DispatchAppointmentCard) {
    if (consumeCardOpenSuppression()) {
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
    return getNextDispatchDragState(
      current,
      { clientX: event.clientX, clientY: event.clientY },
      {
        getAssignmentTargetAtPoint,
        getOverlapWarningForRange,
        getAssignmentOverlapWarning
      }
    );
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
      setActiveDragState(null);
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
      setActiveDragState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card) {
      setActiveDragState(null);
      return;
    }

    const currentEndMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
    const didResize =
      currentEndMinutes === null
        ? state.previewEndMinutes !== state.baseEndMinutes
        : state.previewEndMinutes !== currentEndMinutes;

    if (!didResize) {
      setActiveDragState(null);
      return;
    }

    setActiveDragState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleUpdate(card, buildDispatchResizeDraft(card, state.previewEndMinutes));
      setActiveDragState(null);
    } catch (error) {
      setActiveDragState((current) =>
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
      setActiveDragState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card) {
      setActiveDragState(null);
      return;
    }

    const didMove =
      state.hasMoved &&
      (state.previewStartMinutes !== state.baseStartMinutes ||
        state.previewEndMinutes !== state.baseEndMinutes);

    if (!didMove) {
      setActiveDragState(null);
      return;
    }

    setActiveDragState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleUpdate(
        card,
        buildDispatchMoveDraft(card, state.previewStartMinutes, state.previewEndMinutes)
      );
      setActiveDragState(null);
    } catch (error) {
      setActiveDragState((current) =>
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
      setActiveDragState(null);
      return;
    }

    const card = cards.find((candidate) => candidate.appointmentId === state.appointmentId);

    if (!card || state.targetTechnicianId === null) {
      setActiveDragState(null);
      return;
    }

    if (state.targetTechnicianId === state.sourceTechnicianId) {
      setActiveDragState(null);
      return;
    }

    setActiveDragState((current) =>
      current?.appointmentId === state.appointmentId ? { ...current, mode: 'saving' } : current
    );

    try {
      await onScheduleUpdate(card, buildDispatchReassignmentDraft(card, state.targetTechnicianId));
      setActiveDragState(null);
    } catch (error) {
      setActiveDragState((current) =>
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
                  ? getDispatchDragPlacementPreview(dragState)
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
