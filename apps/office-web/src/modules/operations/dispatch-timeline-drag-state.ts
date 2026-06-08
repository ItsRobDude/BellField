import type { DispatchTimeRange } from './dispatch-overlap-utils';
import {
  timelineEndMinutes,
  timelineSlotMinutes,
  timelineStartMinutes
} from './dispatch-timeline-layout';
import {
  clampDispatchMoveStartMinutes,
  clampDispatchResizeEndMinutes
} from './dispatch-timeline-time';

export type DispatchAssignmentTarget = {
  technicianId: string;
  label: string;
};

export type DispatchPointerPosition = {
  clientX: number;
  clientY: number;
};

export type DispatchDragBaseState = {
  appointmentId: string;
  pointerStartX: number;
  pointerStartY: number;
  slotWidth: number;
  mode: 'dragging' | 'saving' | 'error';
  errorMessage: string | null;
  overlapWarning?: string | null;
};

export type DispatchPendingDragState = DispatchDragBaseState & {
  kind: 'pending';
  sourceTechnicianId: string;
  canTimeMove: boolean;
  baseStartMinutes: number | null;
  baseEndMinutes: number | null;
};

export type DispatchResizeState = DispatchDragBaseState & {
  kind: 'resize';
  startMinutes: number;
  baseEndMinutes: number;
  previewEndMinutes: number;
};

export type DispatchMoveState = DispatchDragBaseState & {
  kind: 'move';
  baseStartMinutes: number;
  baseEndMinutes: number;
  previewStartMinutes: number;
  previewEndMinutes: number;
  hasMoved: boolean;
};

export type DispatchAssignmentState = DispatchDragBaseState & {
  kind: 'assignment';
  sourceTechnicianId: string;
  targetTechnicianId: string | null;
  targetLabel: string | null;
  hasMoved: boolean;
};

export type DispatchTimelineDragState =
  | DispatchPendingDragState
  | DispatchResizeState
  | DispatchMoveState
  | DispatchAssignmentState;

export type DispatchDragTransitionOptions = {
  getAssignmentTargetAtPoint: (
    clientX: number,
    clientY: number,
    sourceTechnicianId: string
  ) => DispatchAssignmentTarget | null;
  getOverlapWarningForRange: (
    appointmentId: string,
    range: DispatchTimeRange | null
  ) => string | null;
  getAssignmentOverlapWarning: (
    appointmentId: string,
    targetTechnicianId: string | null
  ) => string | null;
};

export const dispatchOverlapWarningText = 'Overlaps another appointment';

const dispatchMoveThresholdPixels = 6;
const dispatchAssignmentThresholdPixels = 16;

export function getNextDispatchDragState(
  current: DispatchTimelineDragState,
  pointer: DispatchPointerPosition,
  options: DispatchDragTransitionOptions
): DispatchTimelineDragState {
  const deltaX = pointer.clientX - current.pointerStartX;
  const deltaY = pointer.clientY - current.pointerStartY;
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
      return getMovedDispatchDragState(
        {
          ...current,
          kind: 'move',
          baseStartMinutes: current.baseStartMinutes,
          baseEndMinutes: current.baseEndMinutes,
          previewStartMinutes: current.baseStartMinutes,
          previewEndMinutes: current.baseEndMinutes,
          hasMoved: true
        },
        pointer.clientX,
        options.getOverlapWarningForRange
      );
    }

    if (absoluteDeltaY >= dispatchAssignmentThresholdPixels && absoluteDeltaY > absoluteDeltaX) {
      const target = options.getAssignmentTargetAtPoint(
        pointer.clientX,
        pointer.clientY,
        current.sourceTechnicianId
      );

      return {
        ...current,
        kind: 'assignment',
        targetTechnicianId: target?.technicianId ?? null,
        targetLabel: target?.label ?? null,
        hasMoved: true,
        overlapWarning: options.getAssignmentOverlapWarning(
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
      Math.abs(pointer.clientX - current.pointerStartX) >= dispatchMoveThresholdPixels;

    if (!hasMoved) {
      return current;
    }

    return getMovedDispatchDragState(
      { ...current, hasMoved },
      pointer.clientX,
      options.getOverlapWarningForRange
    );
  }

  if (current.kind === 'assignment') {
    const target = options.getAssignmentTargetAtPoint(
      pointer.clientX,
      pointer.clientY,
      current.sourceTechnicianId
    );

    return {
      ...current,
      targetTechnicianId: target?.technicianId ?? null,
      targetLabel: target?.label ?? null,
      overlapWarning: options.getAssignmentOverlapWarning(
        current.appointmentId,
        target?.technicianId ?? null
      )
    };
  }

  const slotDelta = Math.round((pointer.clientX - current.pointerStartX) / current.slotWidth);
  const previewEndMinutes = clampDispatchResizeEndMinutes(
    current.startMinutes,
    current.baseEndMinutes + slotDelta * timelineSlotMinutes,
    timelineEndMinutes
  );

  return {
    ...current,
    previewEndMinutes,
    overlapWarning: options.getOverlapWarningForRange(current.appointmentId, {
      startMinutes: current.startMinutes,
      endMinutes: previewEndMinutes
    })
  };
}

export function getMovedDispatchDragState(
  state: DispatchMoveState,
  clientX: number,
  getOverlapWarningForRange: (
    appointmentId: string,
    range: DispatchTimeRange | null
  ) => string | null
): DispatchMoveState {
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

export function getDispatchDragPlacementPreview(dragState: DispatchTimelineDragState):
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

export function getDispatchAssignmentPreviewTarget(
  dragState: DispatchTimelineDragState
): DispatchAssignmentTarget | null {
  if (dragState.kind !== 'assignment' || dragState.targetTechnicianId === null) {
    return null;
  }

  return {
    technicianId: dragState.targetTechnicianId,
    label: dragState.targetLabel ?? 'Unassigned'
  };
}

export function shouldSuppressDispatchCardOpenAfterDrag(
  dragState: DispatchTimelineDragState
): boolean {
  return (
    (dragState.kind === 'move' && dragState.hasMoved) ||
    (dragState.kind === 'assignment' && dragState.hasMoved)
  );
}
