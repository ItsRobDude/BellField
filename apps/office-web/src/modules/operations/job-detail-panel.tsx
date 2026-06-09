'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type {
  AppointmentStatus,
  CustomerAccountSummary,
  JobSummary,
  JobStatus,
  JobsWorkspaceResponse,
  LocationSummary,
  MediaAttachmentSummary,
  RegisterEntryKind,
  RegisterEntrySummary
} from '@/lib/operations-api';
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
};

// Final phases: job cost is locked (reopen to revise). Mirrors the API's finalJobStatuses.
const finalJobStatusValues: JobStatus[] = ['completed', 'closed', 'cancelled'];

const registerKindLabels: Record<RegisterEntryKind, string> = {
  labor: 'Labor',
  serviceItem: 'Service item',
  part: 'Part',
  membership: 'Membership',
  other: 'Other'
};

const tabs: Array<{ id: JobDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'captured', label: 'Captured' },
  { id: 'estimates', label: 'Estimates' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'jobCost', label: 'Job cost' },
  { id: 'media', label: 'Media' },
  { id: 'timeline', label: 'Timeline' }
];

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
  onOpenMediaAttachment
}: JobDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<JobDetailTab>(initialTab);
  const [editingRegisterEntryId, setEditingRegisterEntryId] = useState<string | null>(null);
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
        {tabs
          .filter((tab) => tab.id !== 'invoice' || canViewInvoice)
          .filter((tab) => tab.id !== 'jobCost' || canViewJobCosting)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={activeTab === tab.id ? styles.activeTabButton : styles.tabButton}
              onClick={() => setActiveTab(tab.id)}
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
          onSelectTab={setActiveTab}
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
      {activeTab === 'captured'
        ? renderCapturedRegister({
            job,
            capturedWork,
            editingRegisterEntryId,
            onEditRegisterEntry: setEditingRegisterEntryId,
            onRegisterDraftChange,
            onSaveRegisterEntry,
            onRegisterVoidReasonChange,
            onVoidRegisterEntry
          })
        : null}
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
        />
      ) : null}
      {activeTab === 'invoice' && canViewInvoice ? (
        <JobInvoiceSection
          jobId={job.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canEdit={canEditInvoice}
          canPost={canPostInvoice}
          // Adjustments/credits are gated on invoices:create — the same authority
          // that converts an estimate into the invoice.
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
      {activeTab === 'media'
        ? renderMedia({
            job,
            capturedWork,
            onMediaCaptionChange,
            onSaveMediaCaption,
            onMediaVoidReasonChange,
            onVoidMediaAttachment,
            onOpenMediaAttachment
          })
        : null}
      {activeTab === 'timeline' ? renderTimeline(job, timelineHasMore, timelineLimit) : null}
    </section>
  );
}

function renderCapturedRegister({
  job,
  capturedWork,
  editingRegisterEntryId,
  onEditRegisterEntry,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry
}: {
  job: JobSummary;
  capturedWork?: CapturedWorkDetails;
  editingRegisterEntryId: string | null;
  onEditRegisterEntry: (entryId: string | null) => void;
  onRegisterDraftChange: JobDetailPanelProps['onRegisterDraftChange'];
  onSaveRegisterEntry: JobDetailPanelProps['onSaveRegisterEntry'];
  onRegisterVoidReasonChange: JobDetailPanelProps['onRegisterVoidReasonChange'];
  onVoidRegisterEntry: JobDetailPanelProps['onVoidRegisterEntry'];
}) {
  if (!capturedWork || capturedWork.isLoading) {
    return <p style={styles.muted}>Loading captured work...</p>;
  }

  if (capturedWork.registerEntries.length === 0) {
    return <p style={styles.muted}>No register entries.</p>;
  }

  return (
    <div style={styles.list}>
      {capturedWork.registerEntries.map((entry) =>
        renderRegisterEntry({
          job,
          entry,
          draft: capturedWork.registerDrafts[entry.id],
          isEditing: editingRegisterEntryId === entry.id,
          onEditRegisterEntry,
          voidReason: capturedWork.registerVoidReasons[entry.id] ?? '',
          onRegisterDraftChange,
          onSaveRegisterEntry,
          onRegisterVoidReasonChange,
          onVoidRegisterEntry
        })
      )}
    </div>
  );
}

function renderRegisterEntry({
  job,
  entry,
  draft,
  isEditing,
  onEditRegisterEntry,
  voidReason,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry
}: {
  job: JobSummary;
  entry: RegisterEntrySummary;
  draft: RegisterEntryEditDraft | undefined;
  isEditing: boolean;
  onEditRegisterEntry: (entryId: string | null) => void;
  voidReason: string;
  onRegisterDraftChange: JobDetailPanelProps['onRegisterDraftChange'];
  onSaveRegisterEntry: JobDetailPanelProps['onSaveRegisterEntry'];
  onRegisterVoidReasonChange: JobDetailPanelProps['onRegisterVoidReasonChange'];
  onVoidRegisterEntry: JobDetailPanelProps['onVoidRegisterEntry'];
}) {
  const activeDraft = draft ?? {
    appointmentId: entry.appointmentId ?? '',
    kind: entry.kind,
    description: entry.description,
    quantity: String(entry.quantity),
    unitOfMeasure: entry.unitOfMeasure ?? '',
    unitPrice: entry.unitPrice === undefined ? '' : String(entry.unitPrice),
    totalAmount: String(entry.totalAmount),
    partNumber: entry.partNumber ?? '',
    inventorySourceLabel: entry.inventorySourceLabel ?? ''
  };

  return (
    <section key={entry.id} style={entry.isVoid ? styles.mutedPanel : styles.panel}>
      <div style={styles.row}>
        <div>
          <strong>{entry.description}</strong>
          <p style={styles.tinyMuted}>
            {registerKindLabels[entry.kind]} - {formatQuantity(entry.quantity, entry.unitOfMeasure)}{' '}
            - {formatCurrency(entry.totalAmount)}
          </p>
        </div>
        <div style={styles.badgeRow}>
          {entry.isVoid ? <span style={styles.dangerBadge}>Voided</span> : null}
          <span style={styles.badge}>{entry.capturedByName}</span>
          {!entry.isVoid ? (
            <button
              type="button"
              style={styles.button}
              onClick={() => onEditRegisterEntry(isEditing ? null : entry.id)}
            >
              {isEditing ? 'Close' : 'Edit'}
            </button>
          ) : null}
        </div>
      </div>
      <p style={styles.tinyMuted}>
        {formatDateTime(entry.capturedAt)}
        {entry.appointmentId ? ` - ${formatAppointmentReference(job, entry.appointmentId)}` : ''}
      </p>
      {entry.inventorySourceLabel || entry.partNumber || entry.catalogSnapshot?.name ? (
        <p style={styles.tinyMuted}>
          {[entry.catalogSnapshot?.name, entry.partNumber, entry.inventorySourceLabel]
            .filter(Boolean)
            .join(' - ')}
        </p>
      ) : null}
      {entry.isVoid ? (
        <p style={styles.tinyMuted}>
          {entry.voidReason ? `Void reason: ${entry.voidReason}` : 'Voided.'}
        </p>
      ) : isEditing ? (
        <>
          <div style={styles.formGridCompact}>
            <label style={fieldLabelStyle}>
              <span>Kind</span>
              <select
                aria-label={`Register kind for ${entry.description}`}
                value={activeDraft.kind}
                onChange={(event) =>
                  onRegisterDraftChange(job.id, entry.id, {
                    ...activeDraft,
                    kind: event.target.value as RegisterEntryKind
                  })
                }
                style={styles.input}
              >
                {Object.entries(registerKindLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Description"
              ariaLabel={`Register description for ${entry.description}`}
              value={activeDraft.description}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, description: value })
              }
            />
            <TextField
              label="Qty"
              ariaLabel={`Register quantity for ${entry.description}`}
              value={activeDraft.quantity}
              type="number"
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, quantity: value })
              }
            />
            <TextField
              label="Unit"
              ariaLabel={`Register unit for ${entry.description}`}
              value={activeDraft.unitOfMeasure}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, unitOfMeasure: value })
              }
            />
            <TextField
              label="Unit price"
              ariaLabel={`Register unit price for ${entry.description}`}
              value={activeDraft.unitPrice}
              type="number"
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, unitPrice: value })
              }
            />
            <TextField
              label="Total"
              ariaLabel={`Register total for ${entry.description}`}
              value={activeDraft.totalAmount}
              type="number"
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, totalAmount: value })
              }
            />
            <TextField
              label="Part"
              ariaLabel={`Register part number for ${entry.description}`}
              value={activeDraft.partNumber}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, partNumber: value })
              }
            />
            <TextField
              label="Source"
              ariaLabel={`Register source for ${entry.description}`}
              value={activeDraft.inventorySourceLabel}
              onChange={(value) =>
                onRegisterDraftChange(job.id, entry.id, {
                  ...activeDraft,
                  inventorySourceLabel: value
                })
              }
            />
            <label style={fieldLabelStyle}>
              <span>Appointment</span>
              <select
                aria-label={`Register appointment for ${entry.description}`}
                value={activeDraft.appointmentId}
                onChange={(event) =>
                  onRegisterDraftChange(job.id, entry.id, {
                    ...activeDraft,
                    appointmentId: event.target.value
                  })
                }
                style={styles.input}
              >
                <option value="">None</option>
                {job.appointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {formatAppointmentReference(job, appointment.id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.button}
              onClick={() => void onSaveRegisterEntry(job.id, entry.id)}
            >
              Save
            </button>
            <input
              aria-label={`Void reason for ${entry.description}`}
              value={voidReason}
              onChange={(event) => onRegisterVoidReasonChange(job.id, entry.id, event.target.value)}
              placeholder="Void reason"
              style={styles.input}
            />
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => void onVoidRegisterEntry(job.id, entry.id)}
            >
              Void
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function renderMedia({
  job,
  capturedWork,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: {
  job: JobSummary;
  capturedWork?: CapturedWorkDetails;
  onMediaCaptionChange: JobDetailPanelProps['onMediaCaptionChange'];
  onSaveMediaCaption: JobDetailPanelProps['onSaveMediaCaption'];
  onMediaVoidReasonChange: JobDetailPanelProps['onMediaVoidReasonChange'];
  onVoidMediaAttachment: JobDetailPanelProps['onVoidMediaAttachment'];
  onOpenMediaAttachment: JobDetailPanelProps['onOpenMediaAttachment'];
}) {
  if (!capturedWork || capturedWork.isLoading) {
    return <p style={styles.muted}>Loading media...</p>;
  }

  if (capturedWork.mediaAttachments.length === 0) {
    return <p style={styles.muted}>No media.</p>;
  }

  return (
    <div style={styles.list}>
      {capturedWork.mediaAttachments.map((media) =>
        renderMediaAttachment({
          job,
          media,
          captionDraft: capturedWork.mediaCaptionDrafts[media.id] ?? '',
          voidReason: capturedWork.mediaVoidReasons[media.id] ?? '',
          onMediaCaptionChange,
          onSaveMediaCaption,
          onMediaVoidReasonChange,
          onVoidMediaAttachment,
          onOpenMediaAttachment
        })
      )}
    </div>
  );
}

function renderMediaAttachment({
  job,
  media,
  captionDraft,
  voidReason,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: {
  job: JobSummary;
  media: MediaAttachmentSummary;
  captionDraft: string;
  voidReason: string;
  onMediaCaptionChange: JobDetailPanelProps['onMediaCaptionChange'];
  onSaveMediaCaption: JobDetailPanelProps['onSaveMediaCaption'];
  onMediaVoidReasonChange: JobDetailPanelProps['onMediaVoidReasonChange'];
  onVoidMediaAttachment: JobDetailPanelProps['onVoidMediaAttachment'];
  onOpenMediaAttachment: JobDetailPanelProps['onOpenMediaAttachment'];
}) {
  return (
    <section key={media.id} style={media.isVoid ? styles.mutedPanel : styles.panel}>
      <div style={styles.row}>
        <div>
          <strong>{media.originalFilename}</strong>
          <p style={styles.tinyMuted}>
            {formatMediaKind(media.kind)} - {formatByteSize(media.byteSize)}
            {media.appointmentId
              ? ` - ${formatAppointmentReference(job, media.appointmentId)}`
              : ''}
          </p>
        </div>
        <div style={styles.badgeRow}>
          <span style={media.uploadCompleted ? styles.badge : styles.dangerBadge}>
            {media.uploadCompleted ? 'Uploaded' : 'Pending'}
          </span>
          {media.isVoid ? <span style={styles.dangerBadge}>Voided</span> : null}
        </div>
      </div>
      <p style={styles.tinyMuted}>
        {formatDateTime(media.capturedAt)} - {media.capturedByName}
      </p>
      {media.isVoid ? (
        <p style={styles.tinyMuted}>
          {media.voidReason ? `Void reason: ${media.voidReason}` : 'Voided.'}
        </p>
      ) : (
        <>
          <textarea
            aria-label={`Media caption for ${media.originalFilename}`}
            value={captionDraft}
            onChange={(event) => onMediaCaptionChange(job.id, media.id, event.target.value)}
            placeholder="Caption"
            style={styles.textarea}
          />
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.button}
              onClick={() => void onSaveMediaCaption(job.id, media.id)}
            >
              Save
            </button>
            <button
              type="button"
              disabled={!media.uploadCompleted}
              style={styles.button}
              onClick={() => void onOpenMediaAttachment(job.id, media.id)}
            >
              Open
            </button>
            <input
              aria-label={`Void reason for ${media.originalFilename}`}
              value={voidReason}
              onChange={(event) => onMediaVoidReasonChange(job.id, media.id, event.target.value)}
              placeholder="Void reason"
              style={styles.input}
            />
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => void onVoidMediaAttachment(job.id, media.id)}
            >
              Void
            </button>
          </div>
        </>
      )}
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

function TextField({
  label,
  ariaLabel,
  value,
  type = 'text',
  onChange
}: {
  label: string;
  ariaLabel: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        value={value}
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  );
}

function formatAppointmentReference(job: JobSummary, appointmentId: string): string {
  const appointment = job.appointments.find((candidate) => candidate.id === appointmentId);
  if (!appointment) {
    return 'Appointment';
  }
  return `${appointment.scheduledDate ?? 'Unscheduled'} ${appointment.technicianName ?? 'Unassigned'}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatQuantity(quantity: number, unitOfMeasure?: string): string {
  return `${quantity}${unitOfMeasure ? ` ${unitOfMeasure}` : ''}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}

function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }
  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function formatMediaKind(kind: MediaAttachmentSummary['kind']): string {
  return kind[0].toUpperCase() + kind.slice(1);
}

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.85rem',
  fontWeight: 700
};

const jobHeaderMetaStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '0.82rem',
  fontWeight: 700,
  margin: '0.2rem 0 0'
};
