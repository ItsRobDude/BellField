'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AppointmentStatus, DispatchBoardResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildDispatchBoardModel,
  type DispatchAppointmentCard,
  type DispatchBoardModel
} from './dispatch-board-data';
import { DispatchCardContextMenu } from './dispatch-board-context-menu';
import { DispatchDatePicker, getDateInputValue } from './dispatch-date-picker';
import type { JobDetailTab } from './job-work-types';
import type { DispatchScheduleDraft, DispatchScheduleEditorState } from './dispatch-schedule-types';
import {
  createDispatchScheduleDraft,
  DispatchTimelineRow,
  formatDispatchCardAddress,
  formatTechnicianRowSublabel,
  timelineLaneCellStyle,
  type DispatchAssignmentTarget,
  type DispatchContextMenuPosition
} from './dispatch-timeline-row';
import {
  timelineColumnGap,
  timelineGridTemplateColumns,
  timelineLabelWidth,
  timelineLaneMinWidth,
  timelineTickLabels
} from './dispatch-timeline-layout';

export type { DispatchScheduleDraft } from './dispatch-schedule-types';

type DispatchBoardPanelProps = {
  dispatchBoard: DispatchBoardResponse;
  viewDate?: string;
  onViewDateChange?: (date: string) => void;
  onOpenJobDetail?: (jobId: string, appointmentId?: string, initialTab?: JobDetailTab) => void;
  onAppointmentScheduleUpdate?: (
    jobId: string,
    appointmentId: string,
    draft: DispatchScheduleDraft
  ) => Promise<void>;
  onAppointmentStatusUpdate?: (
    jobId: string,
    appointmentId: string,
    status: AppointmentStatus
  ) => Promise<void>;
  isRefreshing?: boolean;
  lastRefreshedAt?: string | null;
  onRefresh?: () => Promise<void>;
};

type DispatchContextMenuState = {
  appointmentId: string;
  position: DispatchContextMenuPosition;
};

export function DispatchBoardPanel({
  dispatchBoard,
  viewDate,
  onViewDateChange,
  onOpenJobDetail,
  onAppointmentScheduleUpdate,
  onAppointmentStatusUpdate,
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
  const [contextMenu, setContextMenu] = useState<DispatchContextMenuState | null>(null);
  const [contextMessage, setContextMessage] = useState<string | null>(null);
  const [assignmentTargetPreview, setAssignmentTargetPreview] =
    useState<DispatchAssignmentTarget | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scheduleEditor && !model.cardLookup.has(scheduleEditor.appointmentId)) {
      setScheduleEditor(null);
    }
  }, [model.cardLookup, scheduleEditor]);

  useEffect(() => {
    if (contextMenu && !model.cardLookup.has(contextMenu.appointmentId)) {
      setContextMenu(null);
    }
  }, [contextMenu, model.cardLookup]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  function handleOpenScheduleEditor(card: DispatchAppointmentCard) {
    setContextMenu(null);
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

  function handleOpenContextMenu(
    card: DispatchAppointmentCard,
    position: DispatchContextMenuState['position']
  ) {
    setScheduleEditor(null);
    setContextMessage(null);
    setAssignmentTargetPreview(null);
    setContextMenu({
      appointmentId: card.appointmentId,
      position
    });
  }

  async function handleCopyAddress(card: DispatchAppointmentCard) {
    const address = formatDispatchCardAddress(card);

    setContextMenu(null);

    if (!address) {
      setContextMessage('No address to copy.');
      return;
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }

      await navigator.clipboard.writeText(address);
      setContextMessage('Address copied.');
    } catch {
      setContextMessage('Unable to copy address.');
    }
  }

  function handleContextStatusChange(card: DispatchAppointmentCard, status: AppointmentStatus) {
    setContextMenu(null);
    void onAppointmentStatusUpdate?.(card.jobId, card.appointmentId, status);
  }

  async function handleTimelineScheduleUpdate(
    card: DispatchAppointmentCard,
    draft: DispatchScheduleDraft
  ) {
    await onAppointmentScheduleUpdate?.(card.jobId, card.appointmentId, draft);
  }

  const contextMenuCard = contextMenu ? model.cardLookup.get(contextMenu.appointmentId) : null;

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
          {contextMessage ? (
            <span role="status" style={styles.tinyMuted}>
              {contextMessage}
            </span>
          ) : null}
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
              assignmentTarget={{ technicianId: '', label: 'Unassigned' }}
              activeAssignmentTargetId={assignmentTargetPreview?.technicianId ?? null}
              cards={model.unassignedQueue}
              activeScheduleEditor={scheduleEditor}
              technicians={dispatchBoard.technicians}
              onOpenJobDetail={onOpenJobDetail}
              onOpenScheduleEditor={
                onAppointmentScheduleUpdate ? handleOpenScheduleEditor : undefined
              }
              onOpenContextMenu={handleOpenContextMenu}
              onScheduleUpdate={
                onAppointmentScheduleUpdate ? handleTimelineScheduleUpdate : undefined
              }
              onAssignmentTargetPreviewChange={setAssignmentTargetPreview}
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
                assignmentTarget={{ technicianId: row.technicianId, label: row.technicianName }}
                activeAssignmentTargetId={assignmentTargetPreview?.technicianId ?? null}
                cards={row.cards}
                activeScheduleEditor={scheduleEditor}
                technicians={dispatchBoard.technicians}
                onOpenJobDetail={onOpenJobDetail}
                onOpenScheduleEditor={
                  onAppointmentScheduleUpdate ? handleOpenScheduleEditor : undefined
                }
                onOpenContextMenu={handleOpenContextMenu}
                onScheduleUpdate={
                  onAppointmentScheduleUpdate ? handleTimelineScheduleUpdate : undefined
                }
                onAssignmentTargetPreviewChange={setAssignmentTargetPreview}
                onScheduleDraftChange={handleScheduleDraftChange}
                onScheduleEditorCancel={() => setScheduleEditor(null)}
                onScheduleEditorSave={handleSaveScheduleEditor}
              />
            ))}
          </div>
        </div>
      </div>
      {contextMenu && contextMenuCard ? (
        <DispatchCardContextMenu
          ref={contextMenuRef}
          card={contextMenuCard}
          address={formatDispatchCardAddress(contextMenuCard)}
          position={contextMenu.position}
          canOpenJobDetail={Boolean(onOpenJobDetail)}
          canEditSchedule={Boolean(onAppointmentScheduleUpdate)}
          canUpdateStatus={Boolean(onAppointmentStatusUpdate)}
          onOpenOverview={() => {
            setContextMenu(null);
            onOpenJobDetail?.(contextMenuCard.jobId, contextMenuCard.appointmentId, 'overview');
          }}
          onOpenAppointments={() => {
            setContextMenu(null);
            onOpenJobDetail?.(contextMenuCard.jobId, contextMenuCard.appointmentId, 'appointments');
          }}
          onEditSchedule={() => handleOpenScheduleEditor(contextMenuCard)}
          onCopyAddress={() => void handleCopyAddress(contextMenuCard)}
          onStatusChange={(status) => handleContextStatusChange(contextMenuCard, status)}
        />
      ) : null}
    </section>
  );
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
