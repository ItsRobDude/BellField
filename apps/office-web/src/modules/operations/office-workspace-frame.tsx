'use client';

import type { ReactNode } from 'react';
import type { EmployeeSummary } from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeView =
  | 'dispatch'
  | 'customers'
  | 'jobs'
  | 'inventory'
  | 'purchasing'
  | 'bookkeeping'
  | 'jobDetail';

type OfficeWorkspaceFrameProps = {
  activeView: OfficeView;
  children: ReactNode;
  employee: EmployeeSummary;
  errorMessage: string | null;
  isDispatchRefreshing: boolean;
  isJobIntakeLoading: boolean;
  isJobsQueueRefreshing: boolean;
  isRefreshing: boolean;
  canViewInventory: boolean;
  canViewBookkeeping: boolean;
  noticeMessage: string | null;
  onOpenJobIntake: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onViewChange: (view: OfficeView) => void;
};

export function OfficeWorkspaceFrame({
  activeView,
  children,
  employee,
  errorMessage,
  isDispatchRefreshing,
  isJobIntakeLoading,
  isJobsQueueRefreshing,
  isRefreshing,
  canViewInventory,
  canViewBookkeeping,
  noticeMessage,
  onOpenJobIntake,
  onRefresh,
  onSignOut,
  onViewChange
}: OfficeWorkspaceFrameProps) {
  const isRefreshBusy =
    isRefreshing || isDispatchRefreshing || isJobsQueueRefreshing || isJobIntakeLoading;

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <aside style={styles.rail} aria-label="Office navigation">
          <div style={styles.railBrand}>BellField</div>
          <NavButton
            label="Dispatch"
            active={activeView === 'dispatch'}
            onClick={() => onViewChange('dispatch')}
          />
          <NavButton
            label="Customers"
            active={activeView === 'customers'}
            onClick={() => onViewChange('customers')}
          />
          <NavButton
            label="Jobs"
            active={activeView === 'jobs'}
            onClick={() => onViewChange('jobs')}
          />
          {canViewInventory ? (
            <NavButton
              label="Inventory"
              active={activeView === 'inventory'}
              onClick={() => onViewChange('inventory')}
            />
          ) : null}
          {canViewBookkeeping ? (
            <NavButton
              label="Bookkeeping"
              active={activeView === 'bookkeeping'}
              onClick={() => onViewChange('bookkeeping')}
            />
          ) : null}
        </aside>

        <div style={styles.workArea}>
          <section style={styles.topBar}>
            <div>
              <strong>{employee.displayName}</strong>
              <p style={styles.tinyMuted}>{employee.email}</p>
            </div>
            <div style={styles.row}>
              <button
                type="button"
                onClick={onOpenJobIntake}
                disabled={isJobIntakeLoading}
                style={styles.primaryButton}
              >
                {isJobIntakeLoading ? 'Loading...' : 'New job'}
              </button>
              <button type="button" onClick={onRefresh} style={styles.button}>
                {isRefreshBusy ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" onClick={onSignOut} style={styles.button}>
                Sign out
              </button>
            </div>
          </section>

          {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
          {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

          {children}
        </div>
      </div>
    </main>
  );
}

function NavButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={active ? styles.activeRailButton : styles.railButton}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
