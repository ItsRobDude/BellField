import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type {
  AppointmentStatus,
  JobStatus,
  JobsWorkspaceResponse,
  MediaAttachmentSummary,
  RegisterEntryKind,
  RegisterEntrySummary
} from '@/lib/operations-api';
import { formatAppointmentScheduleTime } from './appointment-schedule-format';

export type AppointmentDraft = {
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  timeWindowLabel: string;
  technicianId: string;
};

export type AppointmentEditDraft = AppointmentDraft;

export type RegisterEntryEditDraft = {
  appointmentId: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  totalAmount: string;
  partNumber: string;
  inventorySourceLabel: string;
};

export type CapturedWorkDetails = {
  isOpen: boolean;
  isLoading: boolean;
  registerEntries: RegisterEntrySummary[];
  mediaAttachments: MediaAttachmentSummary[];
  registerDrafts: Record<string, RegisterEntryEditDraft>;
  mediaCaptionDrafts: Record<string, string>;
  registerVoidReasons: Record<string, string>;
  mediaVoidReasons: Record<string, string>;
};

type JobsAppointmentsPanelProps = {
  jobsWorkspace: JobsWorkspaceResponse;
  jobLocationId: string;
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
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  onJobLocationChange: (value: string) => void;
  onJobBillToCustomerChange: (value: string) => void;
  onJobTypeChange: (value: string) => void;
  onJobCategoryChange: (value: string) => void;
  onJobOriginChange: (value: string) => void;
  onJobSummaryChange: (value: string) => void;
  onJobTechnicianChange: (value: string) => void;
  onJobDateChange: (value: string) => void;
  onJobStartTimeChange: (value: string) => void;
  onJobEndTimeChange: (value: string) => void;
  onJobWindowChange: (value: string) => void;
  onAppointmentDraftChange: (jobId: string, draft: AppointmentDraft) => void;
  onAppointmentEditDraftChange: (appointmentId: string, draft: AppointmentEditDraft) => void;
  onCreateJob: () => Promise<void>;
  pendingJobStatusChange: {
    jobId: string;
    nextStatus: JobStatus;
    reviewMessage: string;
    isSubmitting: boolean;
  } | null;
  onJobStatusReviewRequested: (
    jobId: string,
    currentStatus: JobStatus,
    status: JobStatus,
    summary: string
  ) => void;
  onConfirmJobStatusChange: () => Promise<void>;
  onCancelJobStatusChange: () => void;
  onAppointmentStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  onSaveAppointmentSchedule: (appointmentId: string) => Promise<void>;
  onAddAppointment: (jobId: string) => Promise<void>;
  onKeepJobOpen: (jobId: string) => Promise<void>;
  capturedWorkByJobId: Record<string, CapturedWorkDetails>;
  onToggleCapturedWork: (jobId: string) => Promise<void>;
  onRegisterDraftChange: (jobId: string, registerEntryId: string, draft: RegisterEntryEditDraft) => void;
  onSaveRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onRegisterVoidReasonChange: (jobId: string, registerEntryId: string, reason: string) => void;
  onVoidRegisterEntry: (jobId: string, registerEntryId: string) => Promise<void>;
  onMediaCaptionChange: (jobId: string, mediaId: string, caption: string) => void;
  onSaveMediaCaption: (jobId: string, mediaId: string) => Promise<void>;
  onMediaVoidReasonChange: (jobId: string, mediaId: string, reason: string) => void;
  onVoidMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
  onOpenMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
  focusedJobId?: string | null;
};

export function JobsAppointmentsPanel({
  jobsWorkspace,
  jobLocationId,
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
  appointmentDrafts,
  appointmentEditDrafts,
  onJobLocationChange,
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
  onAppointmentDraftChange,
  onAppointmentEditDraftChange,
  onCreateJob,
  pendingJobStatusChange,
  onJobStatusReviewRequested,
  onConfirmJobStatusChange,
  onCancelJobStatusChange,
  onAppointmentStatusChange,
  onSaveAppointmentSchedule,
  onAddAppointment,
  onKeepJobOpen,
  capturedWorkByJobId,
  onToggleCapturedWork,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment,
  focusedJobId
}: JobsAppointmentsPanelProps) {
  const selectedLocation = jobsWorkspace.locations.find((location) => location.id === jobLocationId) ?? null;
  const orderedJobs = [...jobsWorkspace.jobs].sort((left, right) => {
    const leftScore = getJobPriorityScore(left);
    const rightScore = getJobPriorityScore(right);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.jobNumber.localeCompare(right.jobNumber);
  });

  const unscheduledJobs = orderedJobs.filter((job) => job.needsScheduling);
  const reviewJobs = orderedJobs.filter((job) => !job.needsScheduling && job.needsOfficeReview);
  const otherJobs = orderedJobs.filter((job) => !job.needsScheduling && !job.needsOfficeReview);

  return (
    <section style={styles.card}>
      <div style={styles.row}>
        <div>
          <h2 style={styles.heading}>Jobs and appointments</h2>
          <p style={styles.muted}>
            BellField now treats jobs as the work layer and appointments as the schedule layer.
          </p>
        </div>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>Unscheduled jobs: {unscheduledJobs.length}</span>
          <span style={styles.badge}>Review needed: {reviewJobs.length}</span>
        </div>
      </div>

      <div style={styles.formRow}>
        <select value={jobLocationId} onChange={(event) => onJobLocationChange(event.target.value)} style={styles.input}>
          {jobsWorkspace.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <select value={jobBillToCustomerId} onChange={(event) => onJobBillToCustomerChange(event.target.value)} style={styles.input}>
          {selectedLocation
            ? [selectedLocation.customerId, ...selectedLocation.alternateBillToCustomerIds].map((customerId) => {
                const customer = jobsWorkspace.customers.find((candidate) => candidate.id === customerId);

                return customer ? (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ) : null;
              })
            : null}
        </select>
        <input value={jobType} onChange={(event) => onJobTypeChange(event.target.value)} placeholder="Job type" style={styles.input} />
        <input value={jobCategory} onChange={(event) => onJobCategoryChange(event.target.value)} placeholder="Category" style={styles.input} />
        <input value={jobOrigin} onChange={(event) => onJobOriginChange(event.target.value)} placeholder="Origin" style={styles.input} />
        <input value={jobSummary} onChange={(event) => onJobSummaryChange(event.target.value)} placeholder="Caller complaint / summary" style={styles.input} />
        <input value={jobDate} onChange={(event) => onJobDateChange(event.target.value)} type="date" style={styles.input} />
        <input
          aria-label="Job start time"
          value={jobStartTime}
          onChange={(event) => onJobStartTimeChange(event.target.value)}
          type="time"
          disabled={!jobDate}
          style={styles.input}
        />
        <input
          aria-label="Job end time"
          value={jobEndTime}
          onChange={(event) => onJobEndTimeChange(event.target.value)}
          type="time"
          disabled={!jobDate}
          style={styles.input}
        />
        <input value={jobWindow} onChange={(event) => onJobWindowChange(event.target.value)} placeholder="1:00 PM - 3:00 PM" style={styles.input} />
        <select value={jobTechnicianId} onChange={(event) => onJobTechnicianChange(event.target.value)} style={styles.input}>
          <option value="">Unassigned</option>
          {jobsWorkspace.technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.displayName}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void onCreateJob()} style={styles.primaryButton}>
          Create job
        </button>
      </div>

      {unscheduledJobs.length > 0 ? (
        <div style={styles.list}>
          <h3 style={styles.subheading}>Unscheduled jobs</h3>
          <p style={styles.muted}>
            These are valid open jobs without a non-cancelled scheduled appointment yet. Add an appointment when the office is ready to put the work on the schedule.
          </p>
          {unscheduledJobs.map((job) =>
            renderJobCard({
              job,
              jobsWorkspace,
              appointmentDrafts,
              appointmentEditDrafts,
              pendingJobStatusChange,
              onJobStatusReviewRequested,
              onConfirmJobStatusChange,
              onCancelJobStatusChange,
              onAppointmentStatusChange,
              onSaveAppointmentSchedule,
              onAppointmentDraftChange,
              onAppointmentEditDraftChange,
              onAddAppointment,
              onKeepJobOpen,
              capturedWorkByJobId,
              onToggleCapturedWork,
              onRegisterDraftChange,
              onSaveRegisterEntry,
              onRegisterVoidReasonChange,
              onVoidRegisterEntry,
              onMediaCaptionChange,
              onSaveMediaCaption,
              onMediaVoidReasonChange,
              onVoidMediaAttachment,
              onOpenMediaAttachment,
              focusedJobId
            })
          )}
        </div>
      ) : null}

      {reviewJobs.length > 0 ? (
        <div style={{ ...styles.list, marginTop: '1.5rem' }}>
          <h3 style={styles.subheading}>Finished visits needing office review</h3>
          {reviewJobs.map((job) =>
            renderJobCard({
              job,
              jobsWorkspace,
              appointmentDrafts,
              appointmentEditDrafts,
              pendingJobStatusChange,
              onJobStatusReviewRequested,
              onConfirmJobStatusChange,
              onCancelJobStatusChange,
              onAppointmentStatusChange,
              onSaveAppointmentSchedule,
              onAppointmentDraftChange,
              onAppointmentEditDraftChange,
              onAddAppointment,
              onKeepJobOpen,
              capturedWorkByJobId,
              onToggleCapturedWork,
              onRegisterDraftChange,
              onSaveRegisterEntry,
              onRegisterVoidReasonChange,
              onVoidRegisterEntry,
              onMediaCaptionChange,
              onSaveMediaCaption,
              onMediaVoidReasonChange,
              onVoidMediaAttachment,
              onOpenMediaAttachment,
              focusedJobId
            })
          )}
        </div>
      ) : null}

      <div style={{ ...styles.list, marginTop: '1.5rem' }}>
        <h3 style={styles.subheading}>All other jobs</h3>
        {otherJobs.map((job) =>
          renderJobCard({
            job,
            jobsWorkspace,
            appointmentDrafts,
            appointmentEditDrafts,
            pendingJobStatusChange,
            onJobStatusReviewRequested,
            onConfirmJobStatusChange,
            onCancelJobStatusChange,
            onAppointmentStatusChange,
            onSaveAppointmentSchedule,
            onAppointmentDraftChange,
            onAppointmentEditDraftChange,
            onAddAppointment,
            onKeepJobOpen,
            capturedWorkByJobId,
            onToggleCapturedWork,
            onRegisterDraftChange,
            onSaveRegisterEntry,
            onRegisterVoidReasonChange,
            onVoidRegisterEntry,
            onMediaCaptionChange,
            onSaveMediaCaption,
            onMediaVoidReasonChange,
            onVoidMediaAttachment,
            onOpenMediaAttachment,
            focusedJobId
          })
        )}
      </div>
    </section>
  );
}

function renderJobCard({
  job,
  jobsWorkspace,
  appointmentDrafts,
  appointmentEditDrafts,
  pendingJobStatusChange,
  onJobStatusReviewRequested,
  onConfirmJobStatusChange,
  onCancelJobStatusChange,
  onAppointmentStatusChange,
  onSaveAppointmentSchedule,
  onAppointmentDraftChange,
  onAppointmentEditDraftChange,
  onAddAppointment,
  onKeepJobOpen,
  capturedWorkByJobId,
  onToggleCapturedWork,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment,
  focusedJobId
}: {
  job: JobsWorkspaceResponse['jobs'][number];
  jobsWorkspace: JobsWorkspaceResponse;
  appointmentDrafts: Record<string, AppointmentDraft>;
  appointmentEditDrafts: Record<string, AppointmentEditDraft>;
  pendingJobStatusChange: JobsAppointmentsPanelProps['pendingJobStatusChange'];
  onJobStatusReviewRequested: JobsAppointmentsPanelProps['onJobStatusReviewRequested'];
  onConfirmJobStatusChange: JobsAppointmentsPanelProps['onConfirmJobStatusChange'];
  onCancelJobStatusChange: JobsAppointmentsPanelProps['onCancelJobStatusChange'];
  onAppointmentStatusChange: JobsAppointmentsPanelProps['onAppointmentStatusChange'];
  onSaveAppointmentSchedule: JobsAppointmentsPanelProps['onSaveAppointmentSchedule'];
  onAppointmentDraftChange: JobsAppointmentsPanelProps['onAppointmentDraftChange'];
  onAppointmentEditDraftChange: JobsAppointmentsPanelProps['onAppointmentEditDraftChange'];
  onAddAppointment: JobsAppointmentsPanelProps['onAddAppointment'];
  onKeepJobOpen: JobsAppointmentsPanelProps['onKeepJobOpen'];
  capturedWorkByJobId: JobsAppointmentsPanelProps['capturedWorkByJobId'];
  onToggleCapturedWork: JobsAppointmentsPanelProps['onToggleCapturedWork'];
  onRegisterDraftChange: JobsAppointmentsPanelProps['onRegisterDraftChange'];
  onSaveRegisterEntry: JobsAppointmentsPanelProps['onSaveRegisterEntry'];
  onRegisterVoidReasonChange: JobsAppointmentsPanelProps['onRegisterVoidReasonChange'];
  onVoidRegisterEntry: JobsAppointmentsPanelProps['onVoidRegisterEntry'];
  onMediaCaptionChange: JobsAppointmentsPanelProps['onMediaCaptionChange'];
  onSaveMediaCaption: JobsAppointmentsPanelProps['onSaveMediaCaption'];
  onMediaVoidReasonChange: JobsAppointmentsPanelProps['onMediaVoidReasonChange'];
  onVoidMediaAttachment: JobsAppointmentsPanelProps['onVoidMediaAttachment'];
  onOpenMediaAttachment: JobsAppointmentsPanelProps['onOpenMediaAttachment'];
  focusedJobId?: string | null;
}) {
  const draft = appointmentDrafts[job.id] ?? createEmptyAppointmentDraft();
  const canAddAppointment = job.status !== 'closed' && job.status !== 'cancelled';
  const isFocused = focusedJobId === job.id;
  const capturedWork = capturedWorkByJobId[job.id];

  return (
    <article
      key={job.id}
      id={getOfficeJobElementId(job.id)}
      aria-current={isFocused ? 'true' : undefined}
      style={getJobCardStyle(isFocused)}
    >
      <div style={styles.row}>
        <div>
          <strong>
            Job {job.jobNumber}: {job.summary}
          </strong>
          <div style={styles.muted}>
            {job.locationName} - {job.billToCustomerName}
          </div>
          <div style={styles.muted}>
            {job.jobType} / {job.category} / {job.origin}
          </div>
        </div>
        <div style={styles.badgeRow}>
          {job.needsScheduling ? <span style={styles.dangerBadge}>Needs scheduling</span> : null}
          {job.needsOfficeReview ? <span style={styles.badge}>Review needed</span> : null}
          {job.status === 'waitingOnParts' ? <span style={styles.badge}>Waiting on parts</span> : null}
        </div>
      </div>
      {job.needsScheduling ? (
        <p style={styles.tinyMuted}>
          This job is still valid; it stays out of technician schedule views until a non-cancelled scheduled appointment is added.
        </p>
      ) : null}

      <div style={styles.row}>
        <select
          value={job.status}
          onChange={(event) =>
            onJobStatusReviewRequested(job.id, job.status, event.target.value as JobStatus, job.summary)
          }
          style={styles.input}
        >
          <option value="new">New</option>
          <option value="scheduled">Scheduled</option>
          <option value="inProgress">In progress</option>
          <option value="waitingOnParts">Waiting on parts</option>
          <option value="completed">Completed</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {job.workOrderNumber ? <div style={styles.muted}>Work order: {job.workOrderNumber}</div> : null}
      </div>

      {pendingJobStatusChange?.jobId === job.id ? (
        <div style={styles.subpanel}>
          <strong>Confirm status change to {pendingJobStatusChange.nextStatus}</strong>
          <div style={styles.muted}>{pendingJobStatusChange.reviewMessage}</div>
          <div style={styles.row}>
            <button type="button" onClick={() => void onConfirmJobStatusChange()} style={styles.button}>
              {pendingJobStatusChange.isSubmitting ? 'Saving...' : 'Confirm status change'}
            </button>
            <button type="button" onClick={onCancelJobStatusChange} style={styles.button}>
              Keep current status
            </button>
          </div>
        </div>
      ) : null}

      {job.needsOfficeReview ? (
        <div style={styles.subpanel}>
          <strong>Finished visit review</strong>
          <p style={styles.muted}>
            Finished visits do not close the job. Pick how the office wants to handle this job so the review stays in history without blocking the work list.
          </p>
          <div style={styles.row}>
            <button
              type="button"
              onClick={() => onJobStatusReviewRequested(job.id, job.status, 'completed', job.summary)}
              style={styles.button}
            >
              Mark job completed
            </button>
            {canAddAppointment ? (
              <button type="button" onClick={() => void onAddAppointment(job.id)} style={styles.button}>
                Schedule follow-up
              </button>
            ) : null}
            <button type="button" onClick={() => void onKeepJobOpen(job.id)} style={styles.button}>
              Keep job open
            </button>
          </div>
        </div>
      ) : null}

      <div style={styles.grid}>
        {job.appointments.map((appointment) => {
          const editDraft = appointmentEditDrafts[appointment.id] ?? {
            scheduledDate: appointment.scheduledDate ?? '',
            scheduledStartTime: appointment.scheduledStartTime ?? '',
            scheduledEndTime: appointment.scheduledEndTime ?? '',
            timeWindowLabel: appointment.timeWindowLabel ?? '',
            technicianId: appointment.technicianId ?? ''
          };
          const appointmentTimeDisplay = formatAppointmentScheduleTime(appointment) ?? 'No time set';

          return (
            <div key={appointment.id} style={getAppointmentPanelStyle(appointment.status, appointment.needsOfficeReview)}>
              <div style={styles.row}>
                <strong>{appointment.scheduledDate || 'Unscheduled visit'}</strong>
                <div style={styles.badgeRow}>
                  <span style={appointment.needsOfficeReview ? styles.badge : styles.tinyMuted}>
                    {appointment.status}
                  </span>
                </div>
              </div>
              <div style={styles.muted}>
                {appointmentTimeDisplay} - {appointment.technicianName || 'Unassigned'}
              </div>
              {appointment.finishOutcome ? (
                <div style={styles.muted}>Finish outcome: {formatFinishOutcome(appointment.finishOutcome)}</div>
              ) : null}
              {appointment.visitNotes ? <div style={styles.tinyMuted}>Notes: {appointment.visitNotes}</div> : null}
              {appointment.hasChargeActivity !== undefined ? (
                <div style={styles.tinyMuted}>
                  Charge activity: {appointment.hasChargeActivity ? 'Yes' : 'No'}
                </div>
              ) : null}
              {appointment.registerFollowUpNote ? (
                <div style={styles.tinyMuted}>Follow-up reminder: {appointment.registerFollowUpNote}</div>
              ) : null}
              <select
                value={appointment.status}
                onChange={(event) =>
                  void onAppointmentStatusChange(appointment.id, event.target.value as AppointmentStatus)
                }
                style={styles.input}
              >
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="dispatched">Dispatched</option>
                <option value="onTheWay">On the way</option>
                <option value="arrived">Arrived</option>
                <option value="working">Working</option>
                <option value="finished">Finished</option>
                <option value="noAnswer">No answer</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div style={styles.formRow}>
                <input
                  value={editDraft.scheduledDate}
                  onChange={(event) =>
                    onAppointmentEditDraftChange(appointment.id, {
                      ...updateAppointmentDraftDate(editDraft, event.target.value)
                    })
                  }
                  type="date"
                  style={styles.input}
                />
                <input
                  aria-label="Appointment start time"
                  value={editDraft.scheduledStartTime}
                  onChange={(event) =>
                    onAppointmentEditDraftChange(appointment.id, {
                      ...editDraft,
                      scheduledStartTime: event.target.value
                    })
                  }
                  type="time"
                  disabled={!editDraft.scheduledDate}
                  style={styles.input}
                />
                <input
                  aria-label="Appointment end time"
                  value={editDraft.scheduledEndTime}
                  onChange={(event) =>
                    onAppointmentEditDraftChange(appointment.id, {
                      ...editDraft,
                      scheduledEndTime: event.target.value
                    })
                  }
                  type="time"
                  disabled={!editDraft.scheduledDate}
                  style={styles.input}
                />
                <input
                  value={editDraft.timeWindowLabel}
                  onChange={(event) =>
                    onAppointmentEditDraftChange(appointment.id, {
                      ...editDraft,
                      timeWindowLabel: event.target.value
                    })
                  }
                  placeholder="Time window"
                  style={styles.input}
                />
                <select
                  value={editDraft.technicianId}
                  onChange={(event) =>
                    onAppointmentEditDraftChange(appointment.id, {
                      ...editDraft,
                      technicianId: event.target.value
                    })
                  }
                  style={styles.input}
                >
                  <option value="">Unassigned</option>
                  {jobsWorkspace.technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.displayName}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void onSaveAppointmentSchedule(appointment.id)} style={styles.button}>
                  Save appointment
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {canAddAppointment ? (
        <div style={styles.formRow}>
          <input
            value={draft.scheduledDate}
            onChange={(event) => onAppointmentDraftChange(job.id, updateAppointmentDraftDate(draft, event.target.value))}
            type="date"
            style={styles.input}
          />
          <input
            aria-label="New appointment start time"
            value={draft.scheduledStartTime}
            onChange={(event) => onAppointmentDraftChange(job.id, { ...draft, scheduledStartTime: event.target.value })}
            type="time"
            disabled={!draft.scheduledDate}
            style={styles.input}
          />
          <input
            aria-label="New appointment end time"
            value={draft.scheduledEndTime}
            onChange={(event) => onAppointmentDraftChange(job.id, { ...draft, scheduledEndTime: event.target.value })}
            type="time"
            disabled={!draft.scheduledDate}
            style={styles.input}
          />
          <input
            value={draft.timeWindowLabel}
            onChange={(event) => onAppointmentDraftChange(job.id, { ...draft, timeWindowLabel: event.target.value })}
            placeholder="Time window"
            style={styles.input}
          />
          <select
            value={draft.technicianId}
            onChange={(event) => onAppointmentDraftChange(job.id, { ...draft, technicianId: event.target.value })}
            style={styles.input}
          >
            <option value="">Unassigned</option>
            {jobsWorkspace.technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.displayName}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void onAddAppointment(job.id)} style={styles.button}>
            Add appointment
          </button>
        </div>
      ) : (
        <p style={styles.tinyMuted}>
          Reopen this job before adding another appointment. Prior appointments and history stay intact, and follow-up appointments can be added after reopening.
        </p>
      )}

      <div style={styles.subpanel}>
        <div style={styles.row}>
          <div>
            <strong>Captured work</strong>
            <p style={styles.tinyMuted}>Register entries and media attachments from field work.</p>
          </div>
          <button type="button" onClick={() => void onToggleCapturedWork(job.id)} style={styles.button}>
            {capturedWork?.isOpen ? 'Hide captured work' : 'Review captured work'}
          </button>
        </div>
        {capturedWork?.isOpen
          ? renderCapturedWork({
              job,
              capturedWork,
              onRegisterDraftChange,
              onSaveRegisterEntry,
              onRegisterVoidReasonChange,
              onVoidRegisterEntry,
              onMediaCaptionChange,
              onSaveMediaCaption,
              onMediaVoidReasonChange,
              onVoidMediaAttachment,
              onOpenMediaAttachment
            })
          : null}
      </div>

      <ul style={styles.timeline}>
        {job.timeline.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.actorName}</strong>: {entry.message}
          </li>
        ))}
      </ul>
    </article>
  );
}

function renderCapturedWork({
  job,
  capturedWork,
  onRegisterDraftChange,
  onSaveRegisterEntry,
  onRegisterVoidReasonChange,
  onVoidRegisterEntry,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: {
  job: JobsWorkspaceResponse['jobs'][number];
  capturedWork: CapturedWorkDetails;
  onRegisterDraftChange: JobsAppointmentsPanelProps['onRegisterDraftChange'];
  onSaveRegisterEntry: JobsAppointmentsPanelProps['onSaveRegisterEntry'];
  onRegisterVoidReasonChange: JobsAppointmentsPanelProps['onRegisterVoidReasonChange'];
  onVoidRegisterEntry: JobsAppointmentsPanelProps['onVoidRegisterEntry'];
  onMediaCaptionChange: JobsAppointmentsPanelProps['onMediaCaptionChange'];
  onSaveMediaCaption: JobsAppointmentsPanelProps['onSaveMediaCaption'];
  onMediaVoidReasonChange: JobsAppointmentsPanelProps['onMediaVoidReasonChange'];
  onVoidMediaAttachment: JobsAppointmentsPanelProps['onVoidMediaAttachment'];
  onOpenMediaAttachment: JobsAppointmentsPanelProps['onOpenMediaAttachment'];
}) {
  if (capturedWork.isLoading) {
    return <p style={styles.muted}>Loading captured work...</p>;
  }

  return (
    <div style={styles.splitGrid}>
      <div style={styles.list}>
        <div style={styles.row}>
          <strong>Register entries</strong>
          <span style={styles.badge}>{capturedWork.registerEntries.length}</span>
        </div>
        {capturedWork.registerEntries.length === 0 ? (
          <p style={styles.tinyMuted}>No register entries captured yet.</p>
        ) : (
          capturedWork.registerEntries.map((entry) =>
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
          )
        )}
      </div>
      <div style={styles.list}>
        <div style={styles.row}>
          <strong>Media attachments</strong>
          <span style={styles.badge}>{capturedWork.mediaAttachments.length}</span>
        </div>
        {capturedWork.mediaAttachments.length === 0 ? (
          <p style={styles.tinyMuted}>No media attachments captured yet.</p>
        ) : (
          capturedWork.mediaAttachments.map((media) =>
            renderMediaAttachment({
              jobId: job.id,
              media,
              captionDraft: capturedWork.mediaCaptionDrafts[media.id] ?? '',
              voidReason: capturedWork.mediaVoidReasons[media.id] ?? '',
              onMediaCaptionChange,
              onSaveMediaCaption,
              onMediaVoidReasonChange,
              onVoidMediaAttachment,
              onOpenMediaAttachment
            })
          )
        )}
      </div>
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
  job: JobsWorkspaceResponse['jobs'][number];
  entry: RegisterEntrySummary;
  draft: RegisterEntryEditDraft | undefined;
  voidReason: string;
  onRegisterDraftChange: JobsAppointmentsPanelProps['onRegisterDraftChange'];
  onSaveRegisterEntry: JobsAppointmentsPanelProps['onSaveRegisterEntry'];
  onRegisterVoidReasonChange: JobsAppointmentsPanelProps['onRegisterVoidReasonChange'];
  onVoidRegisterEntry: JobsAppointmentsPanelProps['onVoidRegisterEntry'];
}) {
  const panelStyle = entry.isVoid ? { ...styles.subpanel, opacity: 0.68 } : styles.subpanel;
  const activeDraft =
    draft ??
    {
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
    <div key={entry.id} style={panelStyle}>
      <div style={styles.row}>
        <div>
          <strong>{entry.description}</strong>
          <p style={styles.tinyMuted}>
            {formatRegisterKind(entry.kind)} - {formatQuantity(entry.quantity, entry.unitOfMeasure)} -{' '}
            {formatCurrency(entry.totalAmount)}
          </p>
        </div>
        <div style={styles.badgeRow}>
          {entry.isVoid ? <span style={styles.dangerBadge}>Voided</span> : null}
          <span style={styles.badge}>{entry.capturedByName}</span>
        </div>
      </div>
      <p style={styles.tinyMuted}>
        Captured {formatDateTime(entry.capturedAt)}
        {entry.appointmentId ? ` - ${formatAppointmentReference(job, entry.appointmentId)}` : ''}
      </p>
      {entry.partNumber || entry.inventorySourceLabel ? (
        <p style={styles.tinyMuted}>
          {entry.partNumber ? `Part ${entry.partNumber}` : ''}
          {entry.partNumber && entry.inventorySourceLabel ? ' - ' : ''}
          {entry.inventorySourceLabel ?? ''}
        </p>
      ) : null}
      {entry.isVoid ? (
        <p style={styles.tinyMuted}>{entry.voidReason ? `Void reason: ${entry.voidReason}` : 'Voided without reason.'}</p>
      ) : (
        <>
          <div style={styles.formRow}>
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
              <option value="labor">Labor</option>
              <option value="serviceItem">Service item</option>
              <option value="part">Part</option>
              <option value="membership">Membership</option>
              <option value="other">Other</option>
            </select>
            <input
              aria-label={`Register description for ${entry.description}`}
              value={activeDraft.description}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, description: event.target.value })
              }
              style={styles.input}
            />
            <input
              aria-label={`Register quantity for ${entry.description}`}
              value={activeDraft.quantity}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, quantity: event.target.value })
              }
              type="number"
              step="0.01"
              style={styles.input}
            />
            <input
              aria-label={`Register unit for ${entry.description}`}
              value={activeDraft.unitOfMeasure}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, unitOfMeasure: event.target.value })
              }
              placeholder="Unit"
              style={styles.input}
            />
            <input
              aria-label={`Register unit price for ${entry.description}`}
              value={activeDraft.unitPrice}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, unitPrice: event.target.value })
              }
              type="number"
              step="0.01"
              placeholder="Unit price"
              style={styles.input}
            />
            <input
              aria-label={`Register total for ${entry.description}`}
              value={activeDraft.totalAmount}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, totalAmount: event.target.value })
              }
              type="number"
              step="0.01"
              style={styles.input}
            />
            <input
              aria-label={`Register part number for ${entry.description}`}
              value={activeDraft.partNumber}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, partNumber: event.target.value })
              }
              placeholder="Part number"
              style={styles.input}
            />
            <input
              aria-label={`Register source for ${entry.description}`}
              value={activeDraft.inventorySourceLabel}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, inventorySourceLabel: event.target.value })
              }
              placeholder="Source"
              style={styles.input}
            />
            <select
              aria-label={`Register appointment for ${entry.description}`}
              value={activeDraft.appointmentId}
              onChange={(event) =>
                onRegisterDraftChange(job.id, entry.id, { ...activeDraft, appointmentId: event.target.value })
              }
              style={styles.input}
            >
              <option value="">No appointment link</option>
              {job.appointments.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  {formatAppointmentReference(job, appointment.id)}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.row}>
            <button type="button" onClick={() => void onSaveRegisterEntry(job.id, entry.id)} style={styles.button}>
              Save register entry
            </button>
            <input
              aria-label={`Void reason for ${entry.description}`}
              value={voidReason}
              onChange={(event) => onRegisterVoidReasonChange(job.id, entry.id, event.target.value)}
              placeholder="Void reason"
              style={styles.input}
            />
            <button type="button" onClick={() => void onVoidRegisterEntry(job.id, entry.id)} style={styles.button}>
              Void register entry
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function renderMediaAttachment({
  jobId,
  media,
  captionDraft,
  voidReason,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: {
  jobId: string;
  media: MediaAttachmentSummary;
  captionDraft: string;
  voidReason: string;
  onMediaCaptionChange: JobsAppointmentsPanelProps['onMediaCaptionChange'];
  onSaveMediaCaption: JobsAppointmentsPanelProps['onSaveMediaCaption'];
  onMediaVoidReasonChange: JobsAppointmentsPanelProps['onMediaVoidReasonChange'];
  onVoidMediaAttachment: JobsAppointmentsPanelProps['onVoidMediaAttachment'];
  onOpenMediaAttachment: JobsAppointmentsPanelProps['onOpenMediaAttachment'];
}) {
  const panelStyle = media.isVoid ? { ...styles.subpanel, opacity: 0.68 } : styles.subpanel;

  return (
    <div key={media.id} style={panelStyle}>
      <div style={styles.row}>
        <div>
          <strong>{media.originalFilename}</strong>
          <p style={styles.tinyMuted}>
            {formatMediaKind(media.kind)} - {media.contentType} - {formatByteSize(media.byteSize)}
          </p>
        </div>
        <div style={styles.badgeRow}>
          {media.uploadCompleted ? <span style={styles.badge}>Uploaded</span> : <span style={styles.dangerBadge}>Pending upload</span>}
          {media.isVoid ? <span style={styles.dangerBadge}>Voided</span> : null}
        </div>
      </div>
      <p style={styles.tinyMuted}>
        Captured {formatDateTime(media.capturedAt)} by {media.capturedByName}
      </p>
      {media.isVoid ? (
        <p style={styles.tinyMuted}>{media.voidReason ? `Void reason: ${media.voidReason}` : 'Voided without reason.'}</p>
      ) : (
        <>
          <textarea
            aria-label={`Media caption for ${media.originalFilename}`}
            value={captionDraft}
            onChange={(event) => onMediaCaptionChange(jobId, media.id, event.target.value)}
            placeholder="Caption"
            style={styles.textarea}
          />
          <div style={styles.row}>
            <button type="button" onClick={() => void onSaveMediaCaption(jobId, media.id)} style={styles.button}>
              Save caption
            </button>
            <button
              type="button"
              disabled={!media.uploadCompleted}
              onClick={() => void onOpenMediaAttachment(jobId, media.id)}
              style={styles.button}
            >
              Open file
            </button>
            <input
              aria-label={`Void reason for ${media.originalFilename}`}
              value={voidReason}
              onChange={(event) => onMediaVoidReasonChange(jobId, media.id, event.target.value)}
              placeholder="Void reason"
              style={styles.input}
            />
            <button type="button" onClick={() => void onVoidMediaAttachment(jobId, media.id)} style={styles.button}>
              Void media
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function getOfficeJobElementId(jobId: string): string {
  return `office-job-${jobId}`;
}

export function createEmptyAppointmentDraft(): AppointmentDraft {
  return {
    scheduledDate: '',
    scheduledStartTime: '',
    scheduledEndTime: '',
    timeWindowLabel: '',
    technicianId: ''
  };
}

function updateAppointmentDraftDate(draft: AppointmentDraft, scheduledDate: string): AppointmentDraft {
  if (!scheduledDate) {
    return {
      ...draft,
      scheduledDate: '',
      scheduledStartTime: '',
      scheduledEndTime: ''
    };
  }

  return {
    ...draft,
    scheduledDate
  };
}

function getJobCardStyle(isFocused: boolean) {
  if (!isFocused) {
    return styles.panel;
  }

  return {
    ...styles.panel,
    borderColor: '#1c6b57',
    boxShadow: '0 0 0 3px rgba(28, 107, 87, 0.16)'
  };
}

function getJobPriorityScore(job: JobsWorkspaceResponse['jobs'][number]): number {
  if (job.needsScheduling) {
    return 3;
  }

  if (job.needsOfficeReview) {
    return 2;
  }

  if (job.status === 'waitingOnParts') {
    return 1;
  }

  return 0;
}

function getAppointmentPanelStyle(status: AppointmentStatus, needsOfficeReview: boolean) {
  if (needsOfficeReview) {
    return {
      ...styles.subpanel,
      border: '1px solid #f5c26b',
      background: '#fff7e8'
    };
  }

  if (status === 'finished') {
    return {
      ...styles.subpanel,
      border: '1px solid #afd7c9',
      background: '#eef8f4'
    };
  }

  return styles.subpanel;
}

function formatFinishOutcome(value: 'completed' | 'followUpNeeded' | 'noAccess') {
  if (value === 'followUpNeeded') {
    return 'Follow-up needed';
  }

  if (value === 'noAccess') {
    return 'No access';
  }

  return 'Completed';
}

function formatRegisterKind(kind: RegisterEntryKind): string {
  if (kind === 'serviceItem') {
    return 'Service item';
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatMediaKind(kind: MediaAttachmentSummary['kind']): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatQuantity(quantity: number, unitOfMeasure?: string): string {
  return `${quantity}${unitOfMeasure ? ` ${unitOfMeasure}` : ''}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}

function formatByteSize(byteSize: number): string {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (byteSize >= 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${byteSize} B`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatAppointmentReference(job: JobsWorkspaceResponse['jobs'][number], appointmentId: string): string {
  const appointment = job.appointments.find((candidate) => candidate.id === appointmentId);
  if (!appointment) {
    return `Appointment ${appointmentId}`;
  }

  return appointment.scheduledDate
    ? `${appointment.scheduledDate} ${appointment.technicianName ?? 'Unassigned'}`
    : `Unscheduled ${appointment.technicianName ?? 'Unassigned'}`;
}
