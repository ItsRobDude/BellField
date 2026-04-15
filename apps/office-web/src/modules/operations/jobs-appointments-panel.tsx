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
  onCreateJob,
  pendingJobStatusChange,
  onJobStatusReviewRequested,
  onConfirmJobStatusChange,
  onCancelJobStatusChange,
  onAppointmentStatusChange,
  onAddAppointment
}: JobsAppointmentsPanelProps) {
  const selectedLocation = jobsWorkspace.locations.find((location) => location.id === jobLocationId) ?? null;

  return (
    <section style={styles.card}>
      <h2 style={styles.heading}>Jobs and appointments</h2>
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
        <input value={jobSummary} onChange={(event) => onJobSummaryChange(event.target.value)} placeholder="Job summary" style={styles.input} />
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
        <button type="button" onClick={() => void onCreateJob()} style={styles.button}>
          Create job
        </button>
      </div>
      <div style={styles.list}>
        {jobsWorkspace.jobs.map((job) => {
          const draft = appointmentDrafts[job.id] ?? { scheduledDate: '', timeWindowLabel: '', technicianId: '' };

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
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="posted">Posted</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              {pendingJobStatusChange?.jobId === job.id ? (
                <div style={styles.subpanel}>
                  <strong>Confirm status change to {pendingJobStatusChange.nextStatus}</strong>
                  <div style={styles.muted}>{pendingJobStatusChange.reviewMessage}</div>
                  <div style={styles.muted}>
                    BellField may still show an additional server warning after the change is applied.
                  </div>
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
                {job.appointments.map((appointment) => (
                  <div key={appointment.id} style={styles.subpanel}>
                    <strong>{appointment.scheduledDate || 'Unscheduled'}</strong>
                    <div style={styles.muted}>
                      {appointment.timeWindowLabel || 'No window'} - {appointment.technicianName || 'Unassigned'}
                    </div>
                    <select
                      value={appointment.status}
                      onChange={(event) =>
                        void onAppointmentStatusChange(
                          appointment.id,
                          event.target.value as AppointmentStatus
                        )
                      }
                      style={styles.input}
                    >
                      <option value="assigned">Assigned</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="onTheWay">On the way</option>
                      <option value="arrived">Arrived</option>
                      <option value="working">Working</option>
                      <option value="finished">Finished</option>
                      <option value="noAnswer">No answer</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                ))}
              </div>
              <div style={styles.formRow}>
                <input
                  value={draft.scheduledDate}
                  onChange={(event) =>
                    onAppointmentDraftChange(job.id, { ...draft, scheduledDate: event.target.value })
                  }
                  type="date"
                  style={styles.input}
                />
                <input
                  value={draft.timeWindowLabel}
                  onChange={(event) =>
                    onAppointmentDraftChange(job.id, { ...draft, timeWindowLabel: event.target.value })
                  }
                  placeholder="Time window"
                  style={styles.input}
                />
                <select
                  value={draft.technicianId}
                  onChange={(event) =>
                    onAppointmentDraftChange(job.id, { ...draft, technicianId: event.target.value })
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
                <button type="button" onClick={() => void onAddAppointment(job.id)} style={styles.button}>
                  Add appointment
                </button>
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
        })}
      </div>
    </section>
  );
}
