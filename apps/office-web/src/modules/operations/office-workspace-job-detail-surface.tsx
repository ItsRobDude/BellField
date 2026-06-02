'use client';

import type { AppointmentStatus, JobDetailResponse, JobStatus } from '@/lib/operations-api';
import { JobDetailPanel } from './job-detail-panel';
import type {
  AppointmentDraft,
  AppointmentEditDraft,
  CapturedWorkDetails,
  JobDetailTab,
  PendingJobStatusChange,
  RegisterEntryEditDraft
} from './job-work-types';
import type { OfficeJobsQueueSurfaceProps } from './office-workspace-jobs-surface';
import { OfficeJobsQueueSurface } from './office-workspace-jobs-surface';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { InvoicePaymentPermissions } from './job-invoice-shared';

export type OfficeJobDetailSurfaceProps = {
  selectedJobId: string | null;
  jobDetailsById: Record<string, JobDetailResponse>;
  apiBaseUrl: string;
  sessionToken: string;
  canCreateEstimate: boolean;
  canEditEstimate: boolean;
  canApproveEstimate: boolean;
  canViewInvoice: boolean;
  canEditInvoice: boolean;
  canPostInvoice: boolean;
  canConvertEstimate: boolean;
  paymentPermissions: InvoicePaymentPermissions;
  focusedAppointmentId: string | null;
  jobDetailInitialTab: JobDetailTab;
  isJobDetailLoading: boolean;
  jobsQueueFallback: OfficeJobsQueueSurfaceProps;
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

export function OfficeJobDetailSurface({
  selectedJobId,
  jobDetailsById,
  apiBaseUrl,
  sessionToken,
  canCreateEstimate,
  canEditEstimate,
  canApproveEstimate,
  canViewInvoice,
  canEditInvoice,
  canPostInvoice,
  canConvertEstimate,
  paymentPermissions,
  focusedAppointmentId,
  jobDetailInitialTab,
  isJobDetailLoading,
  jobsQueueFallback,
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
}: OfficeJobDetailSurfaceProps) {
  const selectedJobDetail = selectedJobId ? (jobDetailsById[selectedJobId] ?? null) : null;
  const selectedJob = selectedJobDetail?.job ?? null;

  if (selectedJob && selectedJobDetail) {
    return (
      <JobDetailPanel
        key={`${selectedJob.id}-${focusedAppointmentId ?? ''}-${jobDetailInitialTab}`}
        technicians={selectedJobDetail.technicians}
        job={selectedJob}
        apiBaseUrl={apiBaseUrl}
        sessionToken={sessionToken}
        canCreateEstimate={canCreateEstimate}
        canEditEstimate={canEditEstimate}
        canApproveEstimate={canApproveEstimate}
        canViewInvoice={canViewInvoice}
        canEditInvoice={canEditInvoice}
        canPostInvoice={canPostInvoice}
        canConvertEstimate={canConvertEstimate}
        paymentPermissions={paymentPermissions}
        initialTab={jobDetailInitialTab}
        focusedAppointmentId={focusedAppointmentId}
        timelineHasMore={selectedJobDetail.timelineHasMore}
        timelineLimit={selectedJobDetail.timelineLimit}
        pendingJobStatusChange={pendingJobStatusChange}
        appointmentDrafts={appointmentDrafts}
        appointmentEditDrafts={appointmentEditDrafts}
        capturedWork={capturedWorkByJobId[selectedJob.id]}
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

  if (isJobDetailLoading || !jobsQueueFallback.jobsQueue) {
    return (
      <section style={styles.workspacePanel} aria-label="Job detail loading">
        <p style={styles.muted}>Loading job...</p>
      </section>
    );
  }

  return <OfficeJobsQueueSurface {...jobsQueueFallback} />;
}
