import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type {
  AppointmentStatus,
  JobStatus,
  JobsWorkspaceResponse
} from '@/lib/operations-api';

export type AppointmentDraft = {
  scheduledDate: string;
  timeWindowLabel: string;
  technicianId: string;
};

export type AppointmentEditDraft = AppointmentDraft;

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
  onAddAppointment
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
              onAddAppointment
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
              onAddAppointment
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
            onAddAppointment
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
  onAddAppointment
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
}) {
  const draft = appointmentDrafts[job.id] ?? { scheduledDate: '', timeWindowLabel: '', technicianId: '' };
  const canAddAppointment = job.status !== 'closed' && job.status !== 'cancelled';

  return (
    <article key={job.id} style={styles.panel}>
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

      <div style={styles.grid}>
        {job.appointments.map((appointment) => {
          const editDraft = appointmentEditDrafts[appointment.id] ?? {
            scheduledDate: appointment.scheduledDate ?? '',
            timeWindowLabel: appointment.timeWindowLabel ?? '',
            technicianId: appointment.technicianId ?? ''
          };

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
                {appointment.timeWindowLabel || 'No window'} - {appointment.technicianName || 'Unassigned'}
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
                      ...editDraft,
                      scheduledDate: event.target.value
                    })
                  }
                  type="date"
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
            onChange={(event) => onAppointmentDraftChange(job.id, { ...draft, scheduledDate: event.target.value })}
            type="date"
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
        <p style={styles.tinyMuted}>Reopen this job before adding another appointment.</p>
      )}

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
