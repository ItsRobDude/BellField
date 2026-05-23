'use client';

import type { JobsWorkspaceResponse } from '@/lib/operations-api';
import { formatAppointmentScheduleDisplay } from './appointment-schedule-format';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobsQueuePanelProps = {
  jobsWorkspace: JobsWorkspaceResponse;
  onOpenJobDetail: (jobId: string, appointmentId?: string) => void;
  onNewJob: () => void;
};

export function JobsQueuePanel({ jobsWorkspace, onOpenJobDetail, onNewJob }: JobsQueuePanelProps) {
  const reviewJobs = jobsWorkspace.jobs.filter((job) => job.needsOfficeReview);
  const unscheduledJobs = jobsWorkspace.jobs.filter(
    (job) => job.needsScheduling && job.status !== 'closed' && job.status !== 'cancelled'
  );
  const activeJobs = jobsWorkspace.jobs.filter(
    (job) => !job.needsOfficeReview && !job.needsScheduling && job.status !== 'closed' && job.status !== 'cancelled'
  );

  return (
    <section aria-label="Jobs queue" style={styles.workspacePanel}>
      <div style={styles.row}>
        <div>
          <h1 style={styles.compactTitle}>Jobs</h1>
          <p style={styles.muted}>{jobsWorkspace.jobs.length} total</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={onNewJob}>
          New job
        </button>
      </div>

      <div style={styles.queueGrid}>
        <QueueColumn title="Review" jobs={reviewJobs} onOpenJobDetail={onOpenJobDetail} />
        <QueueColumn title="Unscheduled" jobs={unscheduledJobs} onOpenJobDetail={onOpenJobDetail} />
        <QueueColumn title="Open" jobs={activeJobs} onOpenJobDetail={onOpenJobDetail} />
      </div>
    </section>
  );
}

function QueueColumn({
  title,
  jobs,
  onOpenJobDetail
}: {
  title: string;
  jobs: JobsWorkspaceResponse['jobs'];
  onOpenJobDetail: JobsQueuePanelProps['onOpenJobDetail'];
}) {
  return (
    <section style={styles.panel} aria-label={`${title} jobs`}>
      <div style={styles.row}>
        <strong>{title}</strong>
        <span style={styles.badge}>{jobs.length}</span>
      </div>
      {jobs.length === 0 ? (
        <p style={styles.tinyMuted}>None</p>
      ) : (
        <div style={styles.listCompact}>
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              style={styles.cardButton}
              onClick={() => onOpenJobDetail(job.id, job.appointments[0]?.id)}
            >
              <div style={styles.row}>
                <strong>Job {job.jobNumber}</strong>
                <span style={job.needsOfficeReview ? styles.dangerBadge : styles.badge}>{job.status}</span>
              </div>
              <span>{job.summary}</span>
              <span style={styles.tinyMuted}>
                {job.locationName} - {nextAppointmentLabel(job)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function nextAppointmentLabel(job: JobsWorkspaceResponse['jobs'][number]): string {
  const appointment = job.appointments.find((candidate) => candidate.status !== 'cancelled') ?? job.appointments[0];
  return appointment ? formatAppointmentScheduleDisplay(appointment) : 'No appointment';
}
