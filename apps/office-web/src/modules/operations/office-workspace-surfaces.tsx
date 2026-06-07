'use client';

import type { DispatchBoardResponse } from '@/lib/operations-api';
import {
  OfficeBookkeepingSurface,
  type OfficeBookkeepingSurfaceProps
} from './office-workspace-bookkeeping-surface';
import { CrmPanel } from './crm-panel';
import { DispatchBoardPanel } from './dispatch-board-panel';
import {
  OfficeInventorySurface,
  type OfficeInventorySurfaceProps
} from './office-workspace-inventory-surface';
import {
  OfficePurchasingSurface,
  type OfficePurchasingSurfaceProps
} from './office-workspace-purchasing-surface';
import {
  OfficeJobDetailSurface,
  type OfficeJobDetailSurfaceProps
} from './office-workspace-job-detail-surface';
import {
  OfficeJobIntakeSurface,
  type OfficeJobIntakeSurfaceProps
} from './office-workspace-job-intake-surface';
import {
  OfficeJobsQueueSurface,
  type OfficeJobsQueueSurfaceProps
} from './office-workspace-jobs-surface';
import { OfficeSystemSurface, type OfficeSystemSurfaceProps } from './office-system-surface';
import { OfficeHistorySurface, type OfficeHistorySurfaceProps } from './office-history-surface';
import { OfficeReportsSurface, type OfficeReportsSurfaceProps } from './office-reports-surface';
import {
  OfficeEmployeeAccessSurface,
  type OfficeEmployeeAccessSurfaceProps
} from './office-employee-access-surface';
import type { CrmNavigationTarget } from './crm-panel-types';
import type { OfficeView } from './office-workspace-frame';

type OfficeCrmSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canReplaceRemoveEquipment: boolean;
  canDeleteEquipment: boolean;
  navigationTarget: CrmNavigationTarget | null;
  onErrorMessage: (message: string | null) => void;
  onNavigationTargetConsumed: () => void;
  onBackToJob: (jobId: string) => void;
};

type OfficeDispatchSurfaceProps = {
  dispatchBoard: DispatchBoardResponse;
  dispatchViewDate: string;
  isDispatchRefreshing: boolean;
  lastDispatchRefreshedAt: string | null;
  onDispatchViewDateChange: (date: string) => void;
  onDispatchRefresh: () => Promise<void>;
  onOpenJobDetail: OfficeJobsQueueSurfaceProps['onOpenJobDetail'];
};

type OfficeWorkspaceSurfacesProps = {
  activeOfficeView: OfficeView;
  crm: OfficeCrmSurfaceProps;
  dispatch: OfficeDispatchSurfaceProps;
  jobDetail: OfficeJobDetailSurfaceProps;
  jobIntake: OfficeJobIntakeSurfaceProps;
  jobs: OfficeJobsQueueSurfaceProps;
  inventory: OfficeInventorySurfaceProps;
  purchasing: OfficePurchasingSurfaceProps;
  bookkeeping: OfficeBookkeepingSurfaceProps;
  system: OfficeSystemSurfaceProps;
  history: OfficeHistorySurfaceProps;
  reports: OfficeReportsSurfaceProps;
  employees: OfficeEmployeeAccessSurfaceProps;
};

export function OfficeWorkspaceSurfaces({
  activeOfficeView,
  crm,
  dispatch,
  jobDetail,
  jobIntake,
  jobs,
  inventory,
  purchasing,
  bookkeeping,
  system,
  history,
  reports,
  employees
}: OfficeWorkspaceSurfacesProps) {
  return (
    <>
      {activeOfficeView === 'jobIntake' ? <OfficeJobIntakeSurface {...jobIntake} /> : null}

      {activeOfficeView === 'dispatch' ? (
        <DispatchBoardPanel
          dispatchBoard={dispatch.dispatchBoard}
          viewDate={dispatch.dispatchViewDate}
          onViewDateChange={dispatch.onDispatchViewDateChange}
          onOpenJobDetail={(jobId, appointmentId) => dispatch.onOpenJobDetail(jobId, appointmentId)}
          isRefreshing={dispatch.isDispatchRefreshing}
          lastRefreshedAt={dispatch.lastDispatchRefreshedAt}
          onRefresh={dispatch.onDispatchRefresh}
        />
      ) : null}

      {activeOfficeView === 'customers' ? (
        <CrmPanel
          apiBaseUrl={crm.apiBaseUrl}
          sessionToken={crm.sessionToken}
          onErrorMessage={crm.onErrorMessage}
          canReplaceRemoveEquipment={crm.canReplaceRemoveEquipment}
          canDeleteEquipment={crm.canDeleteEquipment}
          navigationTarget={crm.navigationTarget}
          onNavigationTargetConsumed={crm.onNavigationTargetConsumed}
          onBackToJob={crm.onBackToJob}
        />
      ) : null}

      {activeOfficeView === 'jobs' ? <OfficeJobsQueueSurface {...jobs} /> : null}

      {activeOfficeView === 'inventory' ? <OfficeInventorySurface {...inventory} /> : null}

      {activeOfficeView === 'purchasing' ? <OfficePurchasingSurface {...purchasing} /> : null}

      {activeOfficeView === 'bookkeeping' ? <OfficeBookkeepingSurface {...bookkeeping} /> : null}

      {activeOfficeView === 'system' ? <OfficeSystemSurface {...system} /> : null}

      {activeOfficeView === 'reports' ? <OfficeReportsSurface {...reports} /> : null}

      {activeOfficeView === 'employees' ? <OfficeEmployeeAccessSurface {...employees} /> : null}

      {activeOfficeView === 'history' ? <OfficeHistorySurface {...history} /> : null}

      {activeOfficeView === 'jobDetail' ? <OfficeJobDetailSurface {...jobDetail} /> : null}
    </>
  );
}
