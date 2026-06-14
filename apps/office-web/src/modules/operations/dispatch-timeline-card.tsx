'use client';

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DispatchBoardResponse } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import {
  type DispatchCardSpaceTier,
  formatDispatchCardAriaLabel,
  formatDispatchCardDetailLine,
  formatDispatchCardPrimaryName
} from './dispatch-card-display';
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

export type DispatchTimelineCardSpaceTier = DispatchCardSpaceTier;

type DispatchCardButtonProps = {
  card: DispatchAppointmentCard;
  activeScheduleEditor: DispatchScheduleEditorState | null;
  dragState: DispatchTimelineDragState | null;
  hasScheduleConflict?: boolean;
  placementStyle?: CSSProperties;
  spaceTier?: DispatchTimelineCardSpaceTier;
  technicians: DispatchBoardResponse['technicians'];
  onOpenJobDetail: () => void;
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
  spaceTier = 'standard',
  technicians,
  onOpenJobDetail,
  onOpenContextMenu,
  onDragStart,
  onResizeStart,
  onScheduleDraftChange,
  onScheduleEditorCancel,
  onScheduleEditorSave
}: DispatchCardButtonProps) {
  const cardFrameRef = useRef<HTMLDivElement | null>(null);
  const statusLabel = appointmentStatusLabels[card.status];
  const hasOverlapWarning = hasScheduleConflict || Boolean(dragState?.overlapWarning);
  const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);
  const endMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
  const usesOverlayActions = Boolean(onOpenContextMenu && spaceTier === 'narrow');
  const timeRangeText =
    startMinutes !== null && endMinutes !== null
      ? formatDispatchResizePreview(startMinutes, endMinutes)
      : null;
  const primaryName = formatDispatchCardPrimaryName(card);
  const detailLine = formatDispatchCardDetailLine(card, spaceTier, {
    statusLabel,
    timeRangeText
  });
  const canResize = Boolean(onResizeStart && card.scheduledDate && startMinutes !== null);
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
        aria-label={formatDispatchCardAriaLabel(card, {
          statusLabel,
          hasScheduleConflict
        })}
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
          <div
            style={{
              ...timelineCardTitleRowStyle,
              ...(usesOverlayActions ? timelineCardTitleRowWithOverlayActionStyle : null)
            }}
          >
            <span style={timelineJobChipStyle}>#{card.jobNumber}</span>
            <strong style={timelineCardLocationStyle}>{primaryName}</strong>
            {spaceTier === 'wide' && card.jobSummary ? (
              <span style={timelineCardSummaryStyle}>· {card.jobSummary}</span>
            ) : null}
            {card.needsOfficeReview ? <span style={timelineReviewChipStyle}>Review</span> : null}
            {hasScheduleConflict ? <span style={timelineOverlapChipStyle}>Overlap</span> : null}
          </div>
          <span style={timelineCardAddressStyle}>{detailLine}</span>
        </div>
      </button>
      {onOpenContextMenu ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={`Dispatch actions for job ${card.jobNumber}`}
          title="Dispatch actions"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            const buttonRect = event.currentTarget.getBoundingClientRect();

            event.preventDefault();
            event.stopPropagation();
            onOpenContextMenu(card, {
              x: buttonRect.left,
              y: buttonRect.bottom + 6
            });
          }}
          style={
            usesOverlayActions
              ? { ...timelineCardActionButtonStyle, ...timelineCardActionOverlayStyle }
              : timelineCardActionButtonStyle
          }
        >
          {spaceTier === 'narrow' ? '...' : 'Actions'}
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

/**
 * The row passes the visible grid span after timeline clamping. Raw duration
 * is not enough: a late-day 3-hour appointment can render as a short card.
 */
export function getDispatchTimelineCardSpaceTier(
  visibleColumnSpan: number
): DispatchTimelineCardSpaceTier {
  if (!Number.isFinite(visibleColumnSpan) || visibleColumnSpan <= 0) {
    return 'standard';
  }
  if (visibleColumnSpan <= 6) {
    return 'narrow';
  }
  if (visibleColumnSpan >= 12) {
    return 'wide';
  }
  return 'standard';
}

export { formatDispatchCardAddress } from './dispatch-card-display';

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
  // The frame owns the 11rem floor. The inner button must stay shrinkable
  // (text ellipsizes) or the Edit button overflows past the card border on
  // narrow appointments.
  minWidth: 0,
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

/**
 * Narrow cards have no width to spare for an inline action slot: float the
 * button over the card's top-right corner instead, clear of the resize
 * handle (width 0.55rem, zIndex 3).
 */
const timelineCardActionOverlayStyle: CSSProperties = {
  position: 'absolute',
  right: '0.65rem',
  top: '0.2rem',
  zIndex: 4,
  marginRight: 0
};

const timelineCardActionButtonStyle: CSSProperties = {
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

const timelineCardTitleRowWithOverlayActionStyle: CSSProperties = {
  paddingRight: '3.1rem'
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
  flex: '0 1 auto',
  fontSize: '0.78rem',
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const timelineCardSummaryStyle: CSSProperties = {
  color: '#475569',
  display: 'block',
  flex: '1 1 auto',
  fontSize: '0.74rem',
  height: timelineCardTextLineHeight,
  lineHeight: timelineCardTextLineHeight,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
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
