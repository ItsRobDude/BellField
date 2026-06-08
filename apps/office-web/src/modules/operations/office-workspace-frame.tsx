'use client';

import { useState, type ReactNode } from 'react';
import type { EmployeeSummary } from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeView =
  | 'dispatch'
  | 'customers'
  | 'jobs'
  | 'jobIntake'
  | 'catalog'
  | 'agreements'
  | 'inventory'
  | 'purchasing'
  | 'bookkeeping'
  | 'reports'
  | 'employees'
  | 'system'
  | 'history'
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
  canViewCatalog: boolean;
  canViewAgreements: boolean;
  canViewPurchasing: boolean;
  canViewBookkeeping: boolean;
  canViewReports: boolean;
  canViewEmployees: boolean;
  canViewSystem: boolean;
  canViewHistory: boolean;
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
  canViewCatalog,
  canViewAgreements,
  canViewPurchasing,
  canViewBookkeeping,
  canViewReports,
  canViewEmployees,
  canViewSystem,
  canViewHistory,
  noticeMessage,
  onOpenJobIntake,
  onRefresh,
  onSignOut,
  onViewChange
}: OfficeWorkspaceFrameProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const isRefreshBusy =
    isRefreshing || isDispatchRefreshing || isJobsQueueRefreshing || isJobIntakeLoading;
  const accountInitials = getEmployeeInitials(employee.displayName, employee.email);

  function handleViewChange(view: OfficeView) {
    setIsAccountMenuOpen(false);
    onViewChange(view);
  }

  function handleOpenJobIntake() {
    setIsAccountMenuOpen(false);
    onOpenJobIntake();
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <aside style={styles.rail} aria-label="Office navigation">
          <div style={styles.railNav}>
            <div style={styles.railBrand}>BellField</div>
            <NavButton
              label="Dispatch"
              active={activeView === 'dispatch'}
              onClick={() => handleViewChange('dispatch')}
            />
            <NavButton
              label="Customers"
              active={activeView === 'customers'}
              onClick={() => handleViewChange('customers')}
            />
            <NavButton
              label="Jobs"
              active={activeView === 'jobs'}
              onClick={() => handleViewChange('jobs')}
            />
            <RailActionButton
              label={isJobIntakeLoading ? 'Loading...' : 'New job'}
              disabled={isJobIntakeLoading}
              onClick={handleOpenJobIntake}
            />
            {canViewInventory ? (
              <NavButton
                label="Inventory"
                active={activeView === 'inventory'}
                onClick={() => handleViewChange('inventory')}
              />
            ) : null}
            {canViewCatalog ? (
              <NavButton
                label="Catalog"
                active={activeView === 'catalog'}
                onClick={() => handleViewChange('catalog')}
              />
            ) : null}
            {canViewAgreements ? (
              <NavButton
                label="Agreements"
                active={activeView === 'agreements'}
                onClick={() => handleViewChange('agreements')}
              />
            ) : null}
            {canViewPurchasing ? (
              <NavButton
                label="Purchasing"
                active={activeView === 'purchasing'}
                onClick={() => handleViewChange('purchasing')}
              />
            ) : null}
            {canViewBookkeeping ? (
              <NavButton
                label="Bookkeeping"
                active={activeView === 'bookkeeping'}
                onClick={() => handleViewChange('bookkeeping')}
              />
            ) : null}
            {canViewReports ? (
              <NavButton
                label="Reports"
                active={activeView === 'reports'}
                onClick={() => handleViewChange('reports')}
              />
            ) : null}
            {canViewEmployees ? (
              <NavButton
                label="Employees"
                active={activeView === 'employees'}
                onClick={() => handleViewChange('employees')}
              />
            ) : null}
            {canViewHistory ? (
              <NavButton
                label="History"
                active={activeView === 'history'}
                onClick={() => handleViewChange('history')}
              />
            ) : null}
            {canViewSystem ? (
              <NavButton
                label="System"
                active={activeView === 'system'}
                onClick={() => handleViewChange('system')}
              />
            ) : null}
          </div>

          <div style={styles.accountDock}>
            {isAccountMenuOpen ? (
              <div style={styles.accountMenu} role="menu" aria-label="Account menu">
                <div>
                  <strong>{employee.displayName}</strong>
                  <p style={styles.tinyMuted}>{employee.email}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isRefreshBusy}
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    onRefresh();
                  }}
                  style={
                    isRefreshBusy
                      ? { ...styles.accountMenuButton, opacity: 0.65 }
                      : styles.accountMenuButton
                  }
                >
                  {isRefreshBusy ? 'Refreshing...' : 'Refresh workspace'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    onSignOut();
                  }}
                  style={styles.accountMenuButton}
                >
                  Sign out
                </button>
              </div>
            ) : null}
            <button
              type="button"
              aria-label={`Account menu for ${employee.displayName}`}
              aria-expanded={isAccountMenuOpen}
              style={styles.accountButton}
              onClick={() => setIsAccountMenuOpen((current) => !current)}
            >
              {accountInitials}
            </button>
          </div>
        </aside>

        <div style={styles.workArea}>
          {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
          {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

          {children}
        </div>
      </div>
    </main>
  );
}

function getEmployeeInitials(displayName: string, email: string): string {
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length > 0) {
    return nameParts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  return email[0]?.toUpperCase() ?? '?';
}

function RailActionButton({
  label,
  disabled,
  onClick
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={disabled ? { ...styles.railButton, opacity: 0.65 } : styles.railButton}
      onClick={onClick}
    >
      {label}
    </button>
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
