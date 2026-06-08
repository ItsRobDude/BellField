'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  getDispatchAssignmentPreviewTarget,
  shouldSuppressDispatchCardOpenAfterDrag,
  type DispatchTimelineDragState
} from './dispatch-timeline-drag-state';

type UseDispatchTimelineDragOptions = {
  getNextDragState: (
    current: DispatchTimelineDragState,
    event: PointerEvent
  ) => DispatchTimelineDragState;
  onAssignmentTargetPreviewChange: (
    target: ReturnType<typeof getDispatchAssignmentPreviewTarget>
  ) => void;
  onDragEnd: (state: DispatchTimelineDragState) => void;
};

type UseDispatchTimelineDragResult = {
  dragState: DispatchTimelineDragState | null;
  setActiveDragState: Dispatch<SetStateAction<DispatchTimelineDragState | null>>;
  consumeCardOpenSuppression: () => boolean;
};

export function useDispatchTimelineDrag({
  getNextDragState,
  onAssignmentTargetPreviewChange,
  onDragEnd
}: UseDispatchTimelineDragOptions): UseDispatchTimelineDragResult {
  const [dragState, setDragState] = useState<DispatchTimelineDragState | null>(null);
  const dragStateRef = useRef<DispatchTimelineDragState | null>(null);
  const suppressNextOpenRef = useRef(false);
  const getNextDragStateRef = useRef(getNextDragState);
  const onAssignmentTargetPreviewChangeRef = useRef(onAssignmentTargetPreviewChange);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    getNextDragStateRef.current = getNextDragState;
    onAssignmentTargetPreviewChangeRef.current = onAssignmentTargetPreviewChange;
    onDragEndRef.current = onDragEnd;
  });

  const setActiveDragState: Dispatch<SetStateAction<DispatchTimelineDragState | null>> = (
    nextState
  ) => {
    if (typeof nextState !== 'function') {
      dragStateRef.current = nextState;
      setDragState(nextState);
      return;
    }

    setDragState((current) => {
      const resolved = nextState(current);
      dragStateRef.current = resolved;
      return resolved;
    });
  };

  useEffect(() => {
    if (!dragState || dragState.mode !== 'dragging') {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const current = dragStateRef.current;

      if (!current || current.mode !== 'dragging') {
        return;
      }

      const next = getNextDragStateRef.current(current, event);

      if (next !== current) {
        setActiveDragState(next);
      }

      onAssignmentTargetPreviewChangeRef.current(getDispatchAssignmentPreviewTarget(next));
    }

    function handlePointerUp() {
      const current = dragStateRef.current;

      if (current) {
        if (shouldSuppressDispatchCardOpenAfterDrag(current)) {
          suppressNextOpenRef.current = true;
        }

        onAssignmentTargetPreviewChangeRef.current(null);
        onDragEndRef.current(current);
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onAssignmentTargetPreviewChangeRef.current(null);
    };
  }, [dragState?.appointmentId, dragState?.mode]);

  function consumeCardOpenSuppression(): boolean {
    if (!suppressNextOpenRef.current) {
      return false;
    }

    suppressNextOpenRef.current = false;
    return true;
  }

  return {
    dragState,
    setActiveDragState,
    consumeCardOpenSuppression
  };
}
