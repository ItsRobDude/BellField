'use client';

import { forwardRef, type CSSProperties } from 'react';
import type { AppointmentStatus } from '@/lib/operations-api';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import { appointmentStatusLabels, appointmentStatusOptions } from './job-work-types';

type DispatchCardContextMenuProps = {
  card: DispatchAppointmentCard;
  address: string;
  position: {
    x: number;
    y: number;
  };
  canOpenJobDetail: boolean;
  canEditSchedule: boolean;
  canUpdateStatus: boolean;
  onOpenOverview: () => void;
  onOpenAppointments: () => void;
  onEditSchedule: () => void;
  onCopyAddress: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
};

export const DispatchCardContextMenu = forwardRef<HTMLDivElement, DispatchCardContextMenuProps>(
  function DispatchCardContextMenu(
    {
      card,
      address,
      position,
      canOpenJobDetail,
      canEditSchedule,
      canUpdateStatus,
      onOpenOverview,
      onOpenAppointments,
      onEditSchedule,
      onCopyAddress,
      onStatusChange
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        role="menu"
        aria-label={`Dispatch actions for job ${card.jobNumber}`}
        style={{ ...contextMenuStyle, left: position.x, top: position.y }}
      >
        <button
          type="button"
          role="menuitem"
          disabled={!canOpenJobDetail}
          style={getMenuButtonStyle(!canOpenJobDetail)}
          onClick={onOpenOverview}
        >
          Open overview
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canOpenJobDetail}
          style={getMenuButtonStyle(!canOpenJobDetail)}
          onClick={onOpenAppointments}
        >
          Open appointments
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canEditSchedule}
          style={getMenuButtonStyle(!canEditSchedule)}
          onClick={onEditSchedule}
        >
          Edit schedule
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canEditSchedule}
          style={getMenuButtonStyle(!canEditSchedule)}
          onClick={onEditSchedule}
        >
          Assign / reassign
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!address}
          style={getMenuButtonStyle(!address)}
          onClick={onCopyAddress}
        >
          Copy address
        </button>

        {canUpdateStatus ? (
          <>
            <div role="separator" style={menuSeparatorStyle} />
            <div role="group" aria-label="Change status" style={statusGroupStyle}>
              <span style={menuSectionLabelStyle}>Change status</span>
              {appointmentStatusOptions.map((status) => {
                const isCurrent = status === card.status;
                const label = appointmentStatusLabels[status];

                return (
                  <button
                    key={status}
                    type="button"
                    role="menuitem"
                    aria-label={
                      isCurrent ? `${label} is the current status` : `Change status to ${label}`
                    }
                    disabled={isCurrent}
                    style={getMenuButtonStyle(isCurrent)}
                    onClick={() => onStatusChange(status)}
                  >
                    {isCurrent ? `${label} (current)` : label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    );
  }
);

const contextMenuStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd8d6',
  borderRadius: 8,
  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)',
  display: 'grid',
  gap: '0.15rem',
  maxHeight: 'min(32rem, calc(100vh - 1rem))',
  overflowY: 'auto',
  padding: '0.35rem',
  position: 'fixed',
  width: '14.5rem',
  zIndex: 50
};

function getMenuButtonStyle(isDisabled: boolean): CSSProperties {
  return {
    background: isDisabled ? '#f8fafc' : '#ffffff',
    border: 0,
    borderRadius: 6,
    color: isDisabled ? '#94a3b8' : '#12212b',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: '0.84rem',
    fontWeight: 700,
    padding: '0.45rem 0.55rem',
    textAlign: 'left'
  };
}

const menuSeparatorStyle: CSSProperties = {
  borderTop: '1px solid #e2e8f0',
  margin: '0.25rem 0'
};

const statusGroupStyle: CSSProperties = {
  display: 'grid',
  gap: '0.15rem'
};

const menuSectionLabelStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '0.7rem',
  fontWeight: 800,
  padding: '0.2rem 0.55rem',
  textTransform: 'uppercase'
};
