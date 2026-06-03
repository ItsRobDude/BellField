'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type {
  AppointmentStatus,
  JobSummary,
  JobStatus,
  JobsWorkspaceResponse,
  MediaAttachmentSummary,
  RegisterEntryKind,
  RegisterEntrySummary
} from '@/lib/operations-api';
import { formatAppointmentScheduleTime } from './appointment-schedule-format';
import {
  appointmentStatusLabels,
  appointmentStatusOptions,
  createAppointmentDraft,
  createEmptyAppointmentDraft,
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
import type { InvoicePaymentPermissions } from './job-invoice-shared';

type JobDetailPanelProps = {
  technicians: JobsWorkspaceResponse['technicians'];
  job: JobSummary;
  apiBaseUrl: string;
  sessionToken: string;
  canCreateEstimate: boolean;
  canEditEstimate: boolean;
  canApproveEstimate: boolean;
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
  pendingJobStatusChange: PendingJobStatusChange | null;
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  capturedWork?: CapturedWorkDetails;
  onBack: () => void;
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

const jobStatusLabels: Record<JobStatus, string> = {
  new: 'New',
  scheduled: 'Scheduled',
  inProgress: 'In progress',
  waitingOnParts: 'Waiting on parts',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

const jobStatusOptions: JobStatus[] = [
  'new',
  'scheduled',
  'inProgress',
  'waitingOnParts',
  'completed',
  'closed',
  'cancelled'
];

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
  apiBaseUrl,
  sessionToken,
  canCreateEstimate,
  canEditEstimate,
  canApproveEstimate,
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
  pendingJobStatusChange,
  appointmentDrafts,
  appointmentEditDrafts,
  capturedWork,
  onBack,
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

      {activeTab === 'overview'
        ? renderOverview({
            job,
            onJobStatusReviewRequested
          })
        : null}
      {activeTab === 'appointments'
        ? renderAppointments({
            job,
            technicians,
            appointmentDrafts,
            appointmentEditDrafts,
            focusedAppointmentId,
            onAppointmentStatusChange,
            onAppointmentDraftChange,
            onAppointmentEditDraftChange,
            onSaveAppointmentSchedule,
            onAddAppointment
          })
        : null}
      {activeTab === 'captured'
        ? renderCapturedRegister({
            job,
            capturedWork,
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
          canConvert={canConvertEstimate}
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

function renderOverview({
  job,
  onJobStatusReviewRequested
}: {
  job: JobSummary;
  onJobStatusReviewRequested: JobDetailPanelProps['onJobStatusReviewRequested'];
}) {
  return (
    <div style={styles.detailGrid}>
      <section style={styles.panel}>
        <div style={styles.formGridCompact}>
          <DetailField label="Location" value={job.locationName} />
          <DetailField label="Bill to" value={job.billToCustomerName} />
          <DetailField label="Type" value={job.jobType} />
          <DetailField label="Category" value={job.category} />
          <DetailField label="Origin" value={job.origin} />
          {job.workOrderNumber ? (
            <DetailField label="Work order" value={job.workOrderNumber} />
          ) : null}
        </div>
      </section>
      <section style={styles.panel}>
        <label style={fieldLabelStyle}>
          <span>Status</span>
          <select
            value={job.status}
            onChange={(event) =>
              onJobStatusReviewRequested(
                job.id,
                job.status,
                event.target.value as JobStatus,
                job.summary
              )
            }
            style={styles.input}
          >
            {jobStatusOptions.map((status) => (
              <option key={status} value={status}>
                {jobStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}

function renderAppointments({
  job,
  technicians,
  appointmentDrafts,
  appointmentEditDrafts,
  focusedAppointmentId,
  onAppointmentStatusChange,
  onAppointmentDraftChange,
  onAppointmentEditDraftChange,
  onSaveAppointmentSchedule,
  onAddAppointment
}: {
  job: JobSummary;
  technicians: JobsWorkspaceResponse['technicians'];
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  focusedAppointmentId?: string | null;
  onAppointmentStatusChange: JobDetailPanelProps['onAppointmentStatusChange'];
  onAppointmentDraftChange: JobDetailPanelProps['onAppointmentDraftChange'];
  onAppointmentEditDraftChange: JobDetailPanelProps['onAppointmentEditDraftChange'];
  onSaveAppointmentSchedule: JobDetailPanelProps['onSaveAppointmentSchedule'];
  onAddAppointment: JobDetailPanelProps['onAddAppointment'];
}) {
  const canAddAppointment = job.status !== 'closed' && job.status !== 'cancelled';
  const draft = appointmentDrafts[job.id] ?? createEmptyAppointmentDraft();

  return (
    <div style={styles.list}>
      {job.appointments.length === 0 ? <p style={styles.muted}>No appointments.</p> : null}
      {job.appointments.map((appointment) => {
        const editDraft =
          appointmentEditDrafts[appointment.id] ?? createAppointmentDraft(appointment);
        const isFocused = focusedAppointmentId === appointment.id;

        return (
          <section
            key={appointment.id}
            style={isFocused ? { ...styles.panel, borderColor: '#1c6b57' } : styles.panel}
            aria-label={`Appointment ${appointment.id}`}
          >
            <div style={styles.row}>
              <div>
                <strong>{appointment.scheduledDate ?? 'Unscheduled'}</strong>
                <p style={styles.tinyMuted}>
                  {formatAppointmentScheduleTime(appointment)} -{' '}
                  {appointment.technicianName ?? 'Unassigned'}
                </p>
              </div>
              <div style={styles.badgeRow}>
                <span style={styles.badge}>{appointmentStatusLabels[appointment.status]}</span>
                {appointment.needsOfficeReview ? (
                  <span style={styles.dangerBadge}>Review</span>
                ) : null}
              </div>
            </div>
            {appointment.finishOutcome ? (
              <p style={styles.tinyMuted}>
                Outcome: {formatFinishOutcome(appointment.finishOutcome)}
              </p>
            ) : null}
            {appointment.visitNotes ? (
              <p style={styles.tinyMuted}>Notes: {appointment.visitNotes}</p>
            ) : null}
            {appointment.registerFollowUpNote ? (
              <p style={styles.tinyMuted}>Follow-up: {appointment.registerFollowUpNote}</p>
            ) : null}
            <div style={styles.formGridCompact}>
              <label style={fieldLabelStyle}>
                <span>Status</span>
                <select
                  value={appointment.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value as AppointmentStatus;
                    if (nextStatus === 'cancelled' && !window.confirm('Cancel this appointment?')) {
                      return;
                    }
                    void onAppointmentStatusChange(appointment.id, nextStatus);
                  }}
                  style={styles.input}
                >
                  {appointmentStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {appointmentStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <ScheduleDraftFields
                draft={editDraft}
                technicians={technicians}
                prefix="Appointment"
                onChange={(patch) => onAppointmentEditDraftChange(appointment.id, editDraft, patch)}
              />
            </div>
            <button
              type="button"
              style={styles.button}
              onClick={() => void onSaveAppointmentSchedule(appointment.id)}
            >
              Save appointment
            </button>
          </section>
        );
      })}
      {canAddAppointment ? (
        <section style={styles.panel} aria-label="Add appointment">
          <div style={styles.formGridCompact}>
            <ScheduleDraftFields
              draft={draft}
              technicians={technicians}
              prefix="New appointment"
              onChange={(patch) => onAppointmentDraftChange(job.id, patch)}
            />
          </div>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => void onAddAppointment(job.id)}
          >
            Add appointment
          </button>
        </section>
      ) : (
        <p style={styles.tinyMuted}>Reopen to add appointments.</p>
      )}
    </div>
  );
}

function ScheduleDraftFields({
  draft,
  technicians,
  prefix,
  onChange
}: {
  draft: AppointmentDraft;
  technicians: JobsWorkspaceResponse['technicians'];
  prefix: string;
  onChange: (patch: Partial<AppointmentDraft>) => void;
}) {
  return (
    <>
      <label style={fieldLabelStyle}>
        <span>Date</span>
        <input
          aria-label={`${prefix} date`}
          type="date"
          value={draft.scheduledDate}
          onChange={(event) =>
            onChange({
              scheduledDate: event.target.value,
              ...(event.target.value ? {} : { scheduledStartTime: '', scheduledEndTime: '' })
            })
          }
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>Start</span>
        <input
          aria-label={`${prefix} start time`}
          type="text"
          placeholder="HH:MM"
          pattern="[0-2][0-9]:[0-5][0-9]"
          title="Use 24-hour HH:MM, for example 13:45."
          autoComplete="off"
          value={draft.scheduledStartTime}
          disabled={!draft.scheduledDate}
          onChange={(event) => onChange({ scheduledStartTime: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>End</span>
        <input
          aria-label={`${prefix} end time`}
          type="text"
          placeholder="HH:MM"
          pattern="[0-2][0-9]:[0-5][0-9]"
          title="Use 24-hour HH:MM, for example 15:45."
          autoComplete="off"
          value={draft.scheduledEndTime}
          disabled={!draft.scheduledDate}
          onChange={(event) => onChange({ scheduledEndTime: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>Window</span>
        <input
          aria-label={`${prefix} time window`}
          value={draft.timeWindowLabel}
          onChange={(event) => onChange({ timeWindowLabel: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={fieldLabelStyle}>
        <span>Tech</span>
        <select
          aria-label={`${prefix} technician`}
          value={draft.technicianId}
          onChange={(event) => onChange({ technicianId: event.target.value })}
          style={styles.input}
        >
          <option value="">Unassigned</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.displayName}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function renderCapturedRegister({
  job,
  capturedWork,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry
}: {
  job: JobSummary;
  capturedWork?: CapturedWorkDetails;
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
  voidReason,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry
}: {
  job: JobSummary;
  entry: RegisterEntrySummary;
  draft: RegisterEntryEditDraft | undefined;
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
        </div>
      </div>
      <p style={styles.tinyMuted}>
        {formatDateTime(entry.capturedAt)}
        {entry.appointmentId ? ` - ${formatAppointmentReference(job, entry.appointmentId)}` : ''}
      </p>
      {entry.isVoid ? (
        <p style={styles.tinyMuted}>
          {entry.voidReason ? `Void reason: ${entry.voidReason}` : 'Voided.'}
        </p>
      ) : (
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
      )}
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={styles.tinyMuted}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
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

function formatFinishOutcome(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.85rem',
  fontWeight: 700
};
