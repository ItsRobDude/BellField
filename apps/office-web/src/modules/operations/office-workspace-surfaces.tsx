'use client';

import type {
  AppointmentStatus,
  CrmSearchResult,
  DispatchBoardResponse,
  JobDetailResponse,
  JobIntakeContextResponse,
  JobStatus,
  JobsQueueKey,
  JobsQueueResponse
} from '@/lib/operations-api';
import { CrmPanel } from './crm-panel';
import { DispatchBoardPanel } from './dispatch-board-panel';
import { JobDetailPanel } from './job-detail-panel';
import {
  JobIntakePanel,
  type JobIntakeBillToOption,
  type JobIntakeCustomerLocationOption,
  type JobIntakeSelectedLocation
} from './job-intake-panel';
import type {
  AppointmentDraft,
  AppointmentEditDraft,
  CapturedWorkDetails,
  JobDetailTab,
  PendingJobStatusChange,
  RegisterEntryEditDraft
} from './job-work-types';
import { JobsQueuePanel } from './jobs-queue-panel';
import type { OfficeView } from './office-workspace-frame';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type OfficeWorkspaceSurfacesProps = {
  activeOfficeView: OfficeView;
  apiBaseUrl: string;
  sessionToken: string;
  canReplaceRemoveEquipment: boolean;
  canDeleteEquipment: boolean;
  dispatchBoard: DispatchBoardResponse;
  dispatchViewDate: string;
  isDispatchRefreshing: boolean;
  lastDispatchRefreshedAt: string | null;
  onDispatchViewDateChange: (date: string) => void;
  onDispatchRefresh: () => Promise<void>;
  onErrorMessage: (message: string | null) => void;
  isJobIntakeOpen: boolean;
  jobIntakeContext: JobIntakeContextResponse | null;
  locationSearchQuery: string;
  locationSearchResults: CrmSearchResult[];
  isLocationSearchLoading: boolean;
  selectedLocation: JobIntakeSelectedLocation | null;
  customerLocationOptions: JobIntakeCustomerLocationOption[];
  customerLocationMessage: string | null;
  billToOptions: JobIntakeBillToOption[];
  billToWarning: string | null;
  jobBillToCustomerId: string;
  jobType: string;
  jobCategory: string;
  jobOrigin: string;
  jobSummary: string;
  jobTechnicianId: string;
  jobDate: string;
  jobStartTime: string;
  jobEndTime: string;
  jobWindow: string;
  onLocationSearchQueryChange: (query: string) => void;
  onSelectLocationSearchResult: (result: CrmSearchResult) => void;
  onSelectCustomerLocation: (locationId: string) => void;
  onClearSelectedLocation: () => void;
  onJobBillToCustomerChange: (customerId: string) => void;
  onJobTypeChange: (value: string) => void;
  onJobCategoryChange: (value: string) => void;
  onJobOriginChange: (value: string) => void;
  onJobSummaryChange: (value: string) => void;
  onJobTechnicianChange: (value: string) => void;
  onJobDateChange: (value: string) => void;
  onJobStartTimeChange: (value: string) => void;
  onJobEndTimeChange: (value: string) => void;
  onJobWindowChange: (value: string) => void;
  onCreateJob: () => Promise<void>;
  onCloseJobIntake: () => void;
  jobsQueue: JobsQueueResponse | null;
  onOpenJobIntake: () => void;
  onLoadMoreJobsQueue: (queueKey: JobsQueueKey, cursor: string) => Promise<void>;
  onOpenJobDetail: (jobId: string, appointmentId?: string, initialTab?: JobDetailTab) => void;
  selectedJobId: string | null;
  jobDetailsById: Record<string, JobDetailResponse>;
  focusedAppointmentId: string | null;
  jobDetailInitialTab: JobDetailTab;
  isJobDetailLoading: boolean;
  pendingJobStatusChange: PendingJobStatusChange | null;
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  capturedWorkByJobId: Record<string, CapturedWorkDetails>;
  onJobDetailBack: () => void;
  onLoadCapturedWork: (jobId: string) => Promise<void>;
  onJobStatusReviewRequested: (
    jobId: string,
    currentStatus: JobStatus,
    status: JobStatus,
    summary: string
  ) => void;
  onConfirmJobStatusChange: () => Promise<void>;
  onCancelJobStatusChange: () => void;
  onAppointmentStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  onAppointmentDraftChange: (jobId: string, patch: Partial<AppointmentDraft>) => void;
  onAppointmentEditDraftChange: (
    appointmentId: string,
    baseDraft: AppointmentEditDraft,
    patch: Partial<AppointmentEditDraft>
  ) => void;
  onSaveAppointmentSchedule: (appointmentId: string) => Promise<void>;
  onAddAppointment: (jobId: string) => Promise<void>;
  onKeepJobOpen: (jobId: string) => Promise<void>;
  onRegisterDraftChange: (
    jobId: string,
    registerEntryId: string,
    draft: RegisterEntryEditDraft
  ) => void;
  onSaveRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onRegisterVoidReasonChange: (jobId: string, registerEntryId: string, reason: string) => void;
  onVoidRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onMediaCaptionChange: (jobId: string, mediaId: string, caption: string) => void;
  onSaveMediaCaption: (jobId: string, mediaId: string) => Promise<void>;
  onMediaVoidReasonChange: (jobId: string, mediaId: string, reason: string) => void;
  onVoidMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
  onOpenMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
};

export function OfficeWorkspaceSurfaces({
  activeOfficeView,
  apiBaseUrl,
  sessionToken,
  canReplaceRemoveEquipment,
  canDeleteEquipment,
  dispatchBoard,
  dispatchViewDate,
  isDispatchRefreshing,
  lastDispatchRefreshedAt,
  onDispatchViewDateChange,
  onDispatchRefresh,
  onErrorMessage,
  isJobIntakeOpen,
  jobIntakeContext,
  locationSearchQuery,
  locationSearchResults,
  isLocationSearchLoading,
  selectedLocation,
  customerLocationOptions,
  customerLocationMessage,
  billToOptions,
  billToWarning,
  jobBillToCustomerId,
  jobType,
  jobCategory,
  jobOrigin,
  jobSummary,
  jobTechnicianId,
  jobDate,
  jobStartTime,
  jobEndTime,
  jobWindow,
  onLocationSearchQueryChange,
  onSelectLocationSearchResult,
  onSelectCustomerLocation,
  onClearSelectedLocation,
  onJobBillToCustomerChange,
  onJobTypeChange,
  onJobCategoryChange,
  onJobOriginChange,
  onJobSummaryChange,
  onJobTechnicianChange,
  onJobDateChange,
  onJobStartTimeChange,
  onJobEndTimeChange,
  onJobWindowChange,
  onCreateJob,
  onCloseJobIntake,
  jobsQueue,
  onOpenJobIntake,
  onLoadMoreJobsQueue,
  onOpenJobDetail,
  selectedJobId,
  jobDetailsById,
  focusedAppointmentId,
  jobDetailInitialTab,
  isJobDetailLoading,
  pendingJobStatusChange,
  appointmentDrafts,
  appointmentEditDrafts,
  capturedWorkByJobId,
  onJobDetailBack,
  onLoadCapturedWork,
  onJobStatusReviewRequested,
  onConfirmJobStatusChange,
  onCancelJobStatusChange,
  onAppointmentStatusChange,
  onAppointmentDraftChange,
  onAppointmentEditDraftChange,
  onSaveAppointmentSchedule,
  onAddAppointment,
  onKeepJobOpen,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: OfficeWorkspaceSurfacesProps) {
  const selectedJobDetail = selectedJobId ? (jobDetailsById[selectedJobId] ?? null) : null;
  const selectedJob = selectedJobDetail?.job ?? null;

  return (
    <>
      {isJobIntakeOpen && jobIntakeContext ? (
        <JobIntakePanel
          intakeContext={jobIntakeContext}
          locationSearchQuery={locationSearchQuery}
          locationSearchResults={locationSearchResults}
          isLocationSearchLoading={isLocationSearchLoading}
          selectedLocation={selectedLocation}
          customerLocationOptions={customerLocationOptions}
          customerLocationMessage={customerLocationMessage}
          billToOptions={billToOptions}
          billToWarning={billToWarning}
          jobBillToCustomerId={jobBillToCustomerId}
          jobType={jobType}
          jobCategory={jobCategory}
          jobOrigin={jobOrigin}
          jobSummary={jobSummary}
          jobTechnicianId={jobTechnicianId}
          jobDate={jobDate}
          jobStartTime={jobStartTime}
          jobEndTime={jobEndTime}
          jobWindow={jobWindow}
          onLocationSearchQueryChange={onLocationSearchQueryChange}
          onSelectLocationSearchResult={onSelectLocationSearchResult}
          onSelectCustomerLocation={onSelectCustomerLocation}
          onClearSelectedLocation={onClearSelectedLocation}
          onJobBillToCustomerChange={onJobBillToCustomerChange}
          onJobTypeChange={onJobTypeChange}
          onJobCategoryChange={onJobCategoryChange}
          onJobOriginChange={onJobOriginChange}
          onJobSummaryChange={onJobSummaryChange}
          onJobTechnicianChange={onJobTechnicianChange}
          onJobDateChange={onJobDateChange}
          onJobStartTimeChange={onJobStartTimeChange}
          onJobEndTimeChange={onJobEndTimeChange}
          onJobWindowChange={onJobWindowChange}
          onCreateJob={onCreateJob}
          onClose={onCloseJobIntake}
        />
      ) : null}

      {activeOfficeView === 'dispatch' ? (
        <DispatchBoardPanel
          dispatchBoard={dispatchBoard}
          viewDate={dispatchViewDate}
          onViewDateChange={onDispatchViewDateChange}
          onOpenJobDetail={(jobId, appointmentId) => onOpenJobDetail(jobId, appointmentId)}
          isRefreshing={isDispatchRefreshing}
          lastRefreshedAt={lastDispatchRefreshedAt}
          onRefresh={onDispatchRefresh}
        />
      ) : null}

      {activeOfficeView === 'customers' ? (
        <CrmPanel
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          onErrorMessage={onErrorMessage}
          canReplaceRemoveEquipment={canReplaceRemoveEquipment}
          canDeleteEquipment={canDeleteEquipment}
        />
      ) : null}

      {activeOfficeView === 'jobs' ? (
        <JobsQueueSurface
          jobsQueue={jobsQueue}
          onOpenJobDetail={onOpenJobDetail}
          onOpenJobIntake={onOpenJobIntake}
          onLoadMoreJobsQueue={onLoadMoreJobsQueue}
        />
      ) : null}

      {activeOfficeView === 'jobDetail' ? (
        <JobDetailSurface
          selectedJob={selectedJob}
          selectedJobDetail={selectedJobDetail}
          focusedAppointmentId={focusedAppointmentId}
          jobDetailInitialTab={jobDetailInitialTab}
          isJobDetailLoading={isJobDetailLoading}
          jobsQueue={jobsQueue}
          pendingJobStatusChange={pendingJobStatusChange}
          appointmentDrafts={appointmentDrafts}
          appointmentEditDrafts={appointmentEditDrafts}
          capturedWork={selectedJob ? capturedWorkByJobId[selectedJob.id] : undefined}
          onJobDetailBack={onJobDetailBack}
          onLoadCapturedWork={onLoadCapturedWork}
          onJobStatusReviewRequested={onJobStatusReviewRequested}
          onConfirmJobStatusChange={onConfirmJobStatusChange}
          onCancelJobStatusChange={onCancelJobStatusChange}
          onAppointmentStatusChange={onAppointmentStatusChange}
          onAppointmentDraftChange={onAppointmentDraftChange}
          onAppointmentEditDraftChange={onAppointmentEditDraftChange}
          onSaveAppointmentSchedule={onSaveAppointmentSchedule}
          onAddAppointment={onAddAppointment}
          onKeepJobOpen={onKeepJobOpen}
          onRegisterDraftChange={onRegisterDraftChange}
          onSaveRegisterEntry={onSaveRegisterEntry}
          onRegisterVoidReasonChange={onRegisterVoidReasonChange}
          onVoidRegisterEntry={onVoidRegisterEntry}
          onMediaCaptionChange={onMediaCaptionChange}
          onSaveMediaCaption={onSaveMediaCaption}
          onMediaVoidReasonChange={onMediaVoidReasonChange}
          onVoidMediaAttachment={onVoidMediaAttachment}
          onOpenMediaAttachment={onOpenMediaAttachment}
          onOpenJobDetail={onOpenJobDetail}
          onOpenJobIntake={onOpenJobIntake}
          onLoadMoreJobsQueue={onLoadMoreJobsQueue}
        />
      ) : null}
    </>
  );
}

function JobsQueueSurface({
  jobsQueue,
  onOpenJobDetail,
  onOpenJobIntake,
  onLoadMoreJobsQueue
}: {
  jobsQueue: JobsQueueResponse | null;
  onOpenJobDetail: (jobId: string, appointmentId?: string, initialTab?: JobDetailTab) => void;
  onOpenJobIntake: () => void;
  onLoadMoreJobsQueue: (queueKey: JobsQueueKey, cursor: string) => Promise<void>;
}) {
  if (!jobsQueue) {
    return (
      <section style={styles.workspacePanel} aria-label="Jobs queue">
        <p style={styles.muted}>Loading jobs...</p>
      </section>
    );
  }

  return (
    <JobsQueuePanel
      jobsQueue={jobsQueue}
      onOpenJobDetail={(jobId, appointmentId) => onOpenJobDetail(jobId, appointmentId)}
      onNewJob={onOpenJobIntake}
      onLoadMoreQueue={(queueKey, cursor) => void onLoadMoreJobsQueue(queueKey, cursor)}
    />
  );
}

function JobDetailSurface({
  selectedJob,
  selectedJobDetail,
  focusedAppointmentId,
  jobDetailInitialTab,
  isJobDetailLoading,
  jobsQueue,
  pendingJobStatusChange,
  appointmentDrafts,
  appointmentEditDrafts,
  capturedWork,
  onJobDetailBack,
  onLoadCapturedWork,
  onJobStatusReviewRequested,
  onConfirmJobStatusChange,
  onCancelJobStatusChange,
  onAppointmentStatusChange,
  onAppointmentDraftChange,
  onAppointmentEditDraftChange,
  onSaveAppointmentSchedule,
  onAddAppointment,
  onKeepJobOpen,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment,
  onOpenJobDetail,
  onOpenJobIntake,
  onLoadMoreJobsQueue
}: {
  selectedJob: JobDetailResponse['job'] | null;
  selectedJobDetail: JobDetailResponse | null;
  focusedAppointmentId: string | null;
  jobDetailInitialTab: JobDetailTab;
  isJobDetailLoading: boolean;
  jobsQueue: JobsQueueResponse | null;
  pendingJobStatusChange: PendingJobStatusChange | null;
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  capturedWork?: CapturedWorkDetails;
  onJobDetailBack: () => void;
  onLoadCapturedWork: (jobId: string) => Promise<void>;
  onJobStatusReviewRequested: (
    jobId: string,
    currentStatus: JobStatus,
    status: JobStatus,
    summary: string
  ) => void;
  onConfirmJobStatusChange: () => Promise<void>;
  onCancelJobStatusChange: () => void;
  onAppointmentStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  onAppointmentDraftChange: (jobId: string, patch: Partial<AppointmentDraft>) => void;
  onAppointmentEditDraftChange: (
    appointmentId: string,
    baseDraft: AppointmentEditDraft,
    patch: Partial<AppointmentEditDraft>
  ) => void;
  onSaveAppointmentSchedule: (appointmentId: string) => Promise<void>;
  onAddAppointment: (jobId: string) => Promise<void>;
  onKeepJobOpen: (jobId: string) => Promise<void>;
  onRegisterDraftChange: (
    jobId: string,
    registerEntryId: string,
    draft: RegisterEntryEditDraft
  ) => void;
  onSaveRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onRegisterVoidReasonChange: (jobId: string, registerEntryId: string, reason: string) => void;
  onVoidRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onMediaCaptionChange: (jobId: string, mediaId: string, caption: string) => void;
  onSaveMediaCaption: (jobId: string, mediaId: string) => Promise<void>;
  onMediaVoidReasonChange: (jobId: string, mediaId: string, reason: string) => void;
  onVoidMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
  onOpenMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
  onOpenJobDetail: (jobId: string, appointmentId?: string, initialTab?: JobDetailTab) => void;
  onOpenJobIntake: () => void;
  onLoadMoreJobsQueue: (queueKey: JobsQueueKey, cursor: string) => Promise<void>;
}) {
  if (selectedJob && selectedJobDetail) {
    return (
      <JobDetailPanel
        key={`${selectedJob.id}-${focusedAppointmentId ?? ''}-${jobDetailInitialTab}`}
        technicians={selectedJobDetail.technicians}
        job={selectedJob}
        initialTab={jobDetailInitialTab}
        focusedAppointmentId={focusedAppointmentId}
        timelineHasMore={selectedJobDetail.timelineHasMore}
        timelineLimit={selectedJobDetail.timelineLimit}
        pendingJobStatusChange={pendingJobStatusChange}
        appointmentDrafts={appointmentDrafts}
        appointmentEditDrafts={appointmentEditDrafts}
        capturedWork={capturedWork}
        onBack={onJobDetailBack}
        onLoadCapturedWork={onLoadCapturedWork}
        onJobStatusReviewRequested={onJobStatusReviewRequested}
        onConfirmJobStatusChange={onConfirmJobStatusChange}
        onCancelJobStatusChange={onCancelJobStatusChange}
        onAppointmentStatusChange={onAppointmentStatusChange}
        onAppointmentDraftChange={onAppointmentDraftChange}
        onAppointmentEditDraftChange={onAppointmentEditDraftChange}
        onSaveAppointmentSchedule={onSaveAppointmentSchedule}
        onAddAppointment={onAddAppointment}
        onKeepJobOpen={onKeepJobOpen}
        onRegisterDraftChange={onRegisterDraftChange}
        onSaveRegisterEntry={onSaveRegisterEntry}
        onRegisterVoidReasonChange={onRegisterVoidReasonChange}
        onVoidRegisterEntry={onVoidRegisterEntry}
        onMediaCaptionChange={onMediaCaptionChange}
        onSaveMediaCaption={onSaveMediaCaption}
        onMediaVoidReasonChange={onMediaVoidReasonChange}
        onVoidMediaAttachment={onVoidMediaAttachment}
        onOpenMediaAttachment={onOpenMediaAttachment}
      />
    );
  }

  if (isJobDetailLoading || !jobsQueue) {
    return (
      <section style={styles.workspacePanel} aria-label="Job detail loading">
        <p style={styles.muted}>Loading job...</p>
      </section>
    );
  }

  return (
    <JobsQueuePanel
      jobsQueue={jobsQueue}
      onOpenJobDetail={(jobId, appointmentId) => onOpenJobDetail(jobId, appointmentId)}
      onNewJob={onOpenJobIntake}
      onLoadMoreQueue={(queueKey, cursor) => void onLoadMoreJobsQueue(queueKey, cursor)}
    />
  );
}
