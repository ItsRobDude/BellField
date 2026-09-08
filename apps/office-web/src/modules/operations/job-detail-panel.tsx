'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type {
  AppointmentStatus,
  CustomerAccountSummary,
  JobSummary,
  JobStatus,
  JobsWorkspaceResponse,
  LocationSummary
} from '@/lib/operations-api';
import { formatDateTime } from '@/lib/format';
import { JobMediaSection } from './job-media-section';
import { JobRegisterEntriesSection } from './job-register-entries-section';
import {
  getOfficeJobElementId,
  type AppointmentDraft,
  type AppointmentEditDraft,
  type CapturedWorkDetails,
  type JobDetailTab,
  type PendingJobStatusChange,
  type RegisterEntryEditDraft
} from './job-work-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { jobDetailTabs, useJobDetailTabGuard } from './job-detail-tabs';
import { JobEstimatesSection } from './job-estimates-section';
import { JobInvoiceSection } from './job-invoice-section';
import { JobCostSection } from './job-cost-section';
import { JobAppointmentsSection } from './job-appointments-section';
import { JobOverviewSection, jobStatusLabels } from './job-overview-section';
import type { InvoicePaymentPermissions } from './job-invoice-shared';

type JobDetailPanelProps = {
  technicians: JobsWorkspaceResponse['technicians'];
  job: JobSummary;
  location: LocationSummary;
  billToCustomer: CustomerAccountSummary;
  apiBaseUrl: string;
  sessionToken: string;
  canCreateEstimate: boolean;
  canEditEstimate: boolean;
  canApproveEstimate: boolean;
  canSendEstimate: boolean;
  canViewCatalog: boolean;
  canViewInvoice: boolean;
  canEditInvoice: boolean;
  canPostInvoice: boolean;
  canSendInvoice: boolean;
  canConvertEstimate: boolean;
  canViewJobCosting: boolean;
  canCreateJobCosting: boolean;
  canEditJobCosting: boolean;
  paymentPermissions: InvoicePaymentPermissions;
  initialTab?: JobDetailTab;
  focusedAppointmentId?: string | null;
  timelineHasMore?: boolean;
  timelineLimit?: number;
  equipmentCount: number;
  registerEntryCount: number;
  mediaAttachmentCount: number;
  pendingJobStatusChange: PendingJobStatusChange | null;
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  capturedWork?: CapturedWorkDetails;
  onBack: () => void;
  onOpenCustomer: (customerId: string, sourceJobId: string) => void;
  onOpenLocation: (locationId: string, sourceJobId: string) => void;
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
  /** Reports tab changes so the shell can keep the address bar in step with the panel. */
  onActiveTabChange?: (tab: JobDetailTab) => void;
};

const finalJobStatusValues: JobStatus[] = ['completed', 'closed', 'cancelled'];

export function JobDetailPanel({
  technicians,
  job,
  location,
  billToCustomer,
  apiBaseUrl,
  sessionToken,
  canCreateEstimate,
  canEditEstimate,
  canApproveEstimate,
  canSendEstimate,
  canViewCatalog,
  canViewInvoice,
  canEditInvoice,
  canPostInvoice,
  canSendInvoice,
  canConvertEstimate,
  canViewJobCosting,
  canCreateJobCosting,
  canEditJobCosting,
  paymentPermissions,
  initialTab = 'overview',
  focusedAppointmentId,
  timelineHasMore = false,
  timelineLimit = 50,
  equipmentCount,
  registerEntryCount,
  mediaAttachmentCount,
  pendingJobStatusChange,
  appointmentDrafts,
  appointmentEditDrafts,
  capturedWork,
  onBack,
  onOpenCustomer,
  onOpenLocation,
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
  onActiveTabChange
}: JobDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<JobDetailTab>(initialTab);
  const [editingRegisterEntryId, setEditingRegisterEntryId] = useState<string | null>(null);
  const selectTab = useCallback(
    (tab: JobDetailTab) => {
      setActiveTab(tab);
      onActiveTabChange?.(tab);
    },
    [onActiveTabChange]
  );
  const { registerGuard: registerEstimatesUnsavedGuard, changeTab } = useJobDetailTabGuard(
    activeTab,
    selectTab,
    'estimates'
  );
  // The address bar owns the tab on refresh and deep links; follow it when it changes.
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const jobPendingStatusChange =
    pendingJobStatusChange?.jobId === job.id ? pendingJobStatusChange : null;
  useEffect(() => {
    if (
      (activeTab === 'captured' || activeTab === 'media') &&
      !capturedWork?.isLoading &&
      !capturedWork
    ) {
      void onLoadCapturedWork(job.id);
    }
  }, [activeTab, capturedWork, job.id, onLoadCapturedWork]);

  return (
    <section
      id={getOfficeJobElementId(job.id)}
      aria-label={`Job ${job.jobNumber} detail`}
      style={styles.workspacePanel}
    >
      <div style={styles.detailHeader}>
        <button type="button" style={styles.button} onClick={onBack}>
          Back
        </button>
        <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
          <h1 style={styles.compactTitle}>Job {job.jobNumber}</h1>
          <p style={styles.muted}>{job.summary}</p>
          <p style={jobHeaderMetaStyle}>{buildJobHeaderMeta(job)}</p>
        </div>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>{jobStatusLabels[job.status]}</span>
          {job.needsOfficeReview ? <span style={styles.dangerBadge}>Review</span> : null}
        </div>
      </div>

      <nav aria-label="Job detail tabs" style={styles.tabList}>
        {jobDetailTabs
          .filter((tab) => tab.id !== 'invoice' || canViewInvoice)
          .filter((tab) => tab.id !== 'jobCost' || canViewJobCosting)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={activeTab === tab.id ? styles.activeTabButton : styles.tabButton}
              onClick={() => changeTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
      </nav>

      {job.needsOfficeReview ? (
        <div style={styles.inlineActionBar}>
          <strong>Review needed</strong>
          <button
            type="button"
            style={styles.button}
            onClick={() => onJobStatusReviewRequested(job.id, job.status, 'completed', job.summary)}
          >
            Complete
          </button>
          <button type="button" style={styles.button} onClick={() => void onAddAppointment(job.id)}>
            Follow-up
          </button>
          <button type="button" style={styles.button} onClick={() => void onKeepJobOpen(job.id)}>
            Keep open
          </button>
        </div>
      ) : null}

      {jobPendingStatusChange ? (
        <div style={styles.inlineActionBar}>
          <span>{jobPendingStatusChange.reviewMessage}</span>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => void onConfirmJobStatusChange()}
          >
            Confirm
          </button>
          <button type="button" style={styles.button} onClick={onCancelJobStatusChange}>
            Cancel
          </button>
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <JobOverviewSection
          job={job}
          location={location}
          billToCustomer={billToCustomer}
          equipmentCount={equipmentCount}
          registerEntryCount={registerEntryCount}
          mediaAttachmentCount={mediaAttachmentCount}
          focusedAppointmentId={focusedAppointmentId}
          onSelectTab={changeTab}
          onOpenCustomer={onOpenCustomer}
          onOpenLocation={onOpenLocation}
          onJobStatusReviewRequested={onJobStatusReviewRequested}
        />
      ) : null}
      {activeTab === 'appointments' ? (
        <JobAppointmentsSection
          job={job}
          technicians={technicians}
          appointmentDrafts={appointmentDrafts}
          appointmentEditDrafts={appointmentEditDrafts}
          focusedAppointmentId={focusedAppointmentId}
          onAppointmentStatusChange={onAppointmentStatusChange}
          onAppointmentDraftChange={onAppointmentDraftChange}
          onAppointmentEditDraftChange={onAppointmentEditDraftChange}
          onSaveAppointmentSchedule={onSaveAppointmentSchedule}
          onAddAppointment={onAddAppointment}
        />
      ) : null}
      {activeTab === 'captured' ? (
        <JobRegisterEntriesSection
          job={job}
          capturedWork={capturedWork}
          editingRegisterEntryId={editingRegisterEntryId}
          onEditRegisterEntry={setEditingRegisterEntryId}
          onRegisterDraftChange={onRegisterDraftChange}
          onSaveRegisterEntry={onSaveRegisterEntry}
          onRegisterVoidReasonChange={onRegisterVoidReasonChange}
          onVoidRegisterEntry={onVoidRegisterEntry}
        />
      ) : null}
      {activeTab === 'estimates' ? (
        <JobEstimatesSection
          jobId={job.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canCreate={canCreateEstimate}
          canEdit={canEditEstimate}
          canApprove={canApproveEstimate}
          canSend={canSendEstimate}
          canConvert={canConvertEstimate}
          canViewCatalog={canViewCatalog}
          billToCustomerEmail={billToCustomer.email}
          onUnsavedChangesGuardChange={registerEstimatesUnsavedGuard}
        />
      ) : null}
      {activeTab === 'invoice' && canViewInvoice ? (
        <JobInvoiceSection
          jobId={job.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canEdit={canEditInvoice}
          canPost={canPostInvoice}
          canSend={canSendInvoice}
          billToCustomerEmail={billToCustomer.email}
          canCreateAdjustments={canConvertEstimate}
          paymentPermissions={paymentPermissions}
        />
      ) : null}
      {activeTab === 'jobCost' && canViewJobCosting ? (
        <JobCostSection
          jobId={job.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canCreate={canCreateJobCosting}
          canEdit={canEditJobCosting}
          jobIsFinal={finalJobStatusValues.includes(job.status)}
        />
      ) : null}
      {activeTab === 'media' ? (
        <JobMediaSection
          job={job}
          capturedWork={capturedWork}
          onMediaCaptionChange={onMediaCaptionChange}
          onSaveMediaCaption={onSaveMediaCaption}
          onMediaVoidReasonChange={onMediaVoidReasonChange}
          onVoidMediaAttachment={onVoidMediaAttachment}
          onOpenMediaAttachment={onOpenMediaAttachment}
        />
      ) : null}
      {activeTab === 'timeline' ? renderTimeline(job, timelineHasMore, timelineLimit) : null}
    </section>
  );
}

function renderTimeline(job: JobSummary, timelineHasMore: boolean, timelineLimit: number) {
  if (job.timeline.length === 0) {
    return <p style={styles.muted}>No timeline entries.</p>;
  }

  return (
    <>
      <ol style={styles.timeline}>
        {job.timeline.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.actorName ?? 'System'}</strong>: {entry.message}{' '}
            <span style={styles.tinyMuted}>{formatDateTime(entry.occurredAt)}</span>
          </li>
        ))}
      </ol>
      {timelineHasMore ? <p style={styles.tinyMuted}>Latest {timelineLimit} shown.</p> : null}
    </>
  );
}

function buildJobHeaderMeta(job: JobSummary): string {
  return [
    job.locationName,
    `Bill to ${job.billToCustomerName}`,
    [job.jobType, job.category].filter(Boolean).join(' / ')
  ]
    .filter(Boolean)
    .join(' - ');
}

const jobHeaderMetaStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '0.82rem',
  fontWeight: 700,
  margin: '0.2rem 0 0'
};
