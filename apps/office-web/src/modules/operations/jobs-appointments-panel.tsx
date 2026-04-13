import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type {
  AppointmentStatus,
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
  jobSummary: string;
  jobTechnicianId: string;
  jobDate: string;
  jobWindow: string;
  appointmentDrafts: Record<string, AppointmentDraft>;
  onJobLocationChange: (value: string) => void;
  onJobBillToCustomerChange: (value: string) => void;
  onJobSummaryChange: (value: string) => void;
  onJobTechnicianChange: (value: string) => void;
  onJobDateChange: (value: string) => void;
  onJobWindowChange: (value: string) => void;
  onAppointmentDraftChange: (jobId: string, draft: AppointmentDraft) => void;
  onCreateJob: () => Promise<void>;
  onJobStatusChange: (jobId: string, status: 'open' | 'closed' | 'posted' | 'cancelled') => Promise<void>;
  onAppointmentStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  onAddAppointment: (jobId: string) => Promise<void>;
};

export function JobsAppointmentsPanel({
  jobsWorkspace,
  jobLocationId,
  jobBillToCustomerId,
  jobSummary,
  jobTechnicianId,
  jobDate,
  jobWindow,
  appointmentDrafts,
  onJobLocationChange,
  onJobBillToCustomerChange,
  onJobSummaryChange,
  onJobTechnicianChange,
  onJobDateChange,
  onJobWindowChange,
  onAppointmentDraftChange,
  onCreateJob,
  onJobStatusChange,
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
                </div>
                <select
                  value={job.status}
                  onChange={(event) =>
                    void onJobStatusChange(
                      job.id,
                      event.target.value as 'open' | 'closed' | 'posted' | 'cancelled'
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
