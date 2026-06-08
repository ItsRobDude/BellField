'use client';

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import { DispatchSchedulePopover } from './dispatch-schedule-popover';
import type { DispatchScheduleDraft, DispatchScheduleEditorState } from './dispatch-schedule-types';
import type { DispatchTimelineDragState } from './dispatch-timeline-drag-state';
import { timelineCardMinHeight, timelineCardTextLineHeight } from './dispatch-timeline-layout';
import {
  formatDispatchMovePreview,
  formatDispatchResizePreview,
  parseDispatchTimeToMinutes
} from './dispatch-timeline-time';
import { appointmentStatusLabels } from './job-work-types';

export type DispatchContextMenuPosition = {
  x: number;
  y: number;
};

type DispatchCardButtonProps = {
  card: DispatchAppointmentCard;
  activeScheduleEditor: DispatchScheduleEditorState | null;
  dragState: DispatchTimelineDragState | null;
  hasScheduleConflict?: boolean;
  placementStyle?: CSSProperties;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail: () => void;
  onOpenScheduleEditor?: (card: DispatchAppointmentCard) => void;
  onOpenContextMenu?: (
    card: DispatchAppointmentCard,
    position: DispatchContextMenuPosition
  ) => void;
  onDragStart?: (
    card: DispatchAppointmentCard,
    event: ReactPointerEvent<HTMLButtonElement>,
    cardFrameElement: HTMLDivElement | null
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

export function DispatchCardButton({
  card,
  activeScheduleEditor,
  dragState,
  hasScheduleConflict = false,
  placementStyle,
  technicians,
  onOpenJobDetail,
  onOpenScheduleEditor,
  onOpenContextMenu,
  onDragStart,
  onResizeStart,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchCardButtonProps) {
  const cardFrameRef = useRef<HTMLDivElement | null>(null);
  const address = formatDispatchCardAddress(card);
  const statusLabel = appointmentStatusLabels[card.status];
  const reviewLabel = card.needsOfficeReview ? ', review needed' : '';
  const overlapLabel = hasScheduleConflict ? ', overlaps another appointment' : '';
  const hasOverlapWarning = hasScheduleConflict || Boolean(dragState?.overlapWarning);
  const canResize = Boolean(
    onResizeStart &&
      card.scheduledDate &&
      parseDispatchTimeToMinutes(card.scheduledStartTime) !== null
  );
  const canDrag = Boolean(onDragStart);
  const dragStatusText = dragState ? formatDispatchDragPreview(dragState) : null;

  return (
    <div
      ref={cardFrameRef}
      style={{
        ...timelineCardFrameStyle,
        ...(hasOverlapWarning ? timelineCardConflictStyle : null),
        ...(dragState ? timelineCardDraggingStyle : null),
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
        onPointerDown={(event) => onDragStart?.(card, event, cardFrameRef.current)}
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
        aria-label={`Job ${card.jobNumber}, ${card.locationName}, ${address}, ${statusLabel}${reviewLabel}${overlapLabel}`}
        style={{
          ...timelineCardMainButtonStyle,
          ...(canDrag ? timelineCardMoveButtonStyle : null),
          ...(dragState?.kind === 'move' && dragState.mode === 'dragging'
            ? timelineCardMovingButtonStyle
            : null)
        }}
      >
        <span aria-hidden="true" style={getTimelineCardRailStyle(card)} />
        <div style={timelineCardBodyStyle}>
          <div style={timelineCardTitleRowStyle}>
            <span style={timelineJobChipStyle}>#{card.jobNumber}</span>
            <strong style={timelineCardLocationStyle}>{card.locationName}</strong>
            {card.needsOfficeReview ? <span style={timelineReviewChipStyle}>Review</span> : null}
            {hasScheduleConflict ? <span style={timelineOverlapChipStyle}>Overlap</span> : null}
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
      {dragStatusText ? (
        <span role="status" style={dragStatusStyle}>
          {dragStatusText}
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

function formatDispatchDragPreview(dragState: DispatchTimelineDragState): string {
  if (dragState.mode === 'saving') {
    return 'Saving...';
  }

  if (dragState.errorMessage) {
    return dragState.errorMessage;
  }

  if (dragState.kind === 'pending') {
    return '';
  }

  let previewText = '';

  if (dragState.kind === 'assignment') {
    if (!dragState.targetLabel) {
      previewText = 'Drop on another row to assign';
    } else {
      previewText = dragState.targetTechnicianId
        ? `Assign to ${dragState.targetLabel}`
        : 'Move to Unassigned';
    }
  } else if (dragState.kind === 'move') {
    previewText = formatDispatchMovePreview(
      dragState.previewStartMinutes,
      dragState.previewEndMinutes
    );
  } else {
    previewText = formatDispatchResizePreview(dragState.startMinutes, dragState.previewEndMinutes);
  }

  return dragState.overlapWarning ? `${previewText}: ${dragState.overlapWarning}` : previewText;
}

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

const timelineCardDraggingStyle: CSSProperties = {
  boxShadow: '0 0 0 2px rgba(23, 107, 91, 0.18)',
  outline: '1px solid #176b5b'
};

const timelineCardConflictStyle: CSSProperties = {
  background: '#fff7ed',
  borderColor: '#f59e0b',
  boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.16)'
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

const timelineCardMoveButtonStyle: CSSProperties = {
  cursor: 'grab'
};

const timelineCardMovingButtonStyle: CSSProperties = {
  cursor: 'grabbing'
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

const dragStatusStyle: CSSProperties = {
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

const timelineOverlapChipStyle: CSSProperties = {
  alignItems: 'center',
  background: '#fef3c7',
  borderRadius: 4,
  color: '#92400e',
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
  fontSize: '0.72rem',
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};
