'use client';

import type { DispatchBoardResponse } from '@/lib/operations-api';
import { CrmPanel } from './crm-panel';
import { DispatchBoardPanel } from './dispatch-board-panel';
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
import type { OfficeView } from './office-workspace-frame';

type OfficeCrmSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canReplaceRemoveEquipment: boolean;
  canDeleteEquipment: boolean;
  onErrorMessage: (message: string | null) => void;
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
};

export function OfficeWorkspaceSurfaces({
  activeOfficeView,
  crm,
  dispatch,
  jobDetail,
  jobIntake,
  jobs
}: OfficeWorkspaceSurfacesProps) {
  return (
    <>
      <OfficeJobIntakeSurface {...jobIntake} />

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
        />
      ) : null}

      {activeOfficeView === 'jobs' ? <OfficeJobsQueueSurface {...jobs} /> : null}

      {activeOfficeView === 'jobDetail' ? <OfficeJobDetailSurface {...jobDetail} /> : null}
    </>
  );
}
