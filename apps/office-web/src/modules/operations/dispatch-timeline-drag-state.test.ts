import { describe, expect, it, vi } from 'vitest';
import {
  dispatchOverlapWarningText,
  getDispatchDragPlacementPreview,
  getNextDispatchDragState,
  shouldSuppressDispatchCardOpenAfterDrag,
  type DispatchDragTransitionOptions,
  type DispatchAssignmentState,
  type DispatchMoveState,
  type DispatchPendingDragState,
  type DispatchResizeState
} from './dispatch-timeline-drag-state';

function buildPendingDragState(
  overrides: Partial<DispatchPendingDragState> = {}
): DispatchPendingDragState {
  return {
    kind: 'pending',
    appointmentId: 'appt-1',
    sourceTechnicianId: 'tech-1',
    canTimeMove: true,
    baseStartMinutes: 8 * 60,
    baseEndMinutes: 10 * 60,
    pointerStartX: 100,
    pointerStartY: 100,
    slotWidth: 24,
    mode: 'dragging',
    errorMessage: null,
    overlapWarning: null,
    ...overrides
  };
}

function buildMoveDragState(overrides: Partial<DispatchMoveState> = {}): DispatchMoveState {
  return {
    kind: 'move',
    appointmentId: 'appt-1',
    baseStartMinutes: 8 * 60,
    baseEndMinutes: 10 * 60,
    previewStartMinutes: 8 * 60,
    previewEndMinutes: 10 * 60,
    hasMoved: true,
    pointerStartX: 100,
    pointerStartY: 100,
    slotWidth: 24,
    mode: 'dragging',
    errorMessage: null,
    overlapWarning: null,
    ...overrides
  };
}

function buildResizeDragState(overrides: Partial<DispatchResizeState> = {}): DispatchResizeState {
  return {
    kind: 'resize',
    appointmentId: 'appt-1',
    startMinutes: 8 * 60,
    baseEndMinutes: 10 * 60,
    previewEndMinutes: 10 * 60,
    pointerStartX: 100,
    pointerStartY: 100,
    slotWidth: 24,
    mode: 'dragging',
    errorMessage: null,
    overlapWarning: null,
    ...overrides
  };
}

function buildAssignmentDragState(
  overrides: Partial<DispatchAssignmentState> = {}
): DispatchAssignmentState {
  return {
    kind: 'assignment',
    appointmentId: 'appt-1',
    sourceTechnicianId: 'tech-1',
    targetTechnicianId: 'tech-2',
    targetLabel: 'Sam Tech',
    hasMoved: true,
    pointerStartX: 100,
    pointerStartY: 100,
    slotWidth: 24,
    mode: 'dragging',
    errorMessage: null,
    overlapWarning: null,
    ...overrides
  };
}

function buildTransitionOptions(
  overrides: Partial<DispatchDragTransitionOptions> = {}
): DispatchDragTransitionOptions {
  return {
    getAssignmentTargetAtPoint: vi.fn(() => null),
    getOverlapWarningForRange: vi.fn(() => null),
    getAssignmentOverlapWarning: vi.fn(() => null),
    ...overrides
  };
}

describe('dispatch timeline drag state', () => {
  it('keeps pending drags pending until movement intent is clear', () => {
    const pending = buildPendingDragState();

    expect(
      getNextDispatchDragState(pending, { clientX: 104, clientY: 104 }, buildTransitionOptions())
    ).toBe(pending);
  });

  it('turns horizontal movement into a snapped time move preview', () => {
    const next = getNextDispatchDragState(
      buildPendingDragState(),
      { clientX: 148, clientY: 102 },
      buildTransitionOptions()
    );

    expect(next.kind).toBe('move');
    expect(next).toMatchObject({
      hasMoved: true,
      previewStartMinutes: 8 * 60 + 30,
      previewEndMinutes: 10 * 60 + 30
    });
  });

  it('turns vertical movement into a row assignment preview', () => {
    const getAssignmentTargetAtPoint = vi.fn(() => ({
      technicianId: 'tech-2',
      label: 'Sam Tech'
    }));
    const next = getNextDispatchDragState(
      buildPendingDragState(),
      { clientX: 102, clientY: 130 },
      buildTransitionOptions({
        getAssignmentTargetAtPoint,
        getAssignmentOverlapWarning: vi.fn(() => dispatchOverlapWarningText)
      })
    );

    expect(getAssignmentTargetAtPoint).toHaveBeenCalledWith(102, 130, 'tech-1');
    expect(next).toMatchObject({
      kind: 'assignment',
      targetTechnicianId: 'tech-2',
      targetLabel: 'Sam Tech',
      overlapWarning: dispatchOverlapWarningText
    });
  });

  it('updates resize previews with overlap warnings', () => {
    const getOverlapWarningForRange = vi.fn(() => dispatchOverlapWarningText);
    const next = getNextDispatchDragState(
      buildResizeDragState(),
      { clientX: 148, clientY: 100 },
      buildTransitionOptions({ getOverlapWarningForRange })
    );

    expect(next).toMatchObject({
      kind: 'resize',
      previewEndMinutes: 10 * 60 + 30,
      overlapWarning: dispatchOverlapWarningText
    });
    expect(getOverlapWarningForRange).toHaveBeenCalledWith('appt-1', {
      startMinutes: 8 * 60,
      endMinutes: 10 * 60 + 30
    });
  });

  it('returns placement previews only for time-changing drags', () => {
    expect(getDispatchDragPlacementPreview(buildMoveDragState())).toEqual({
      startMinutes: 8 * 60,
      endMinutes: 10 * 60
    });
    expect(getDispatchDragPlacementPreview(buildResizeDragState())).toEqual({
      endMinutes: 10 * 60
    });
    expect(getDispatchDragPlacementPreview(buildAssignmentDragState())).toBeUndefined();
  });

  it('suppresses card opening only after move or assignment drags', () => {
    expect(shouldSuppressDispatchCardOpenAfterDrag(buildMoveDragState())).toBe(true);
    expect(shouldSuppressDispatchCardOpenAfterDrag(buildAssignmentDragState())).toBe(true);
    expect(shouldSuppressDispatchCardOpenAfterDrag(buildResizeDragState())).toBe(false);
    expect(shouldSuppressDispatchCardOpenAfterDrag(buildPendingDragState())).toBe(false);
  });
});
