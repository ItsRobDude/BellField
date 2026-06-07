'use client';

import type { CSSProperties } from 'react';
import type { JobsQueueKey, JobsQueueResponse } from '@/lib/operations-api';
import { formatAppointmentScheduleDisplay } from './appointment-schedule-format';
import { jobStatusLabels } from './job-overview-section';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobsQueuePanelProps = {
  jobsQueue: JobsQueueResponse;
  onOpenJobDetail: (jobId: string, appointmentId?: string) => void;
  onNewJob: () => void;
  onLoadMoreQueue?: (queueKey: JobsQueueKey, cursor: string) => void;
};

type JobsQueueSection = JobsQueueResponse['queues'][number];
type JobsQueueItem = JobsQueueSection['jobs'][number];

const queueLabels: Record<JobsQueueKey, string> = {
  review: 'Review',
  waitingOnParts: 'Waiting',
  unscheduled: 'Unscheduled',
  open: 'Open'
};

export function JobsQueuePanel({
  jobsQueue,
  onOpenJobDetail,
  onNewJob,
  onLoadMoreQueue
}: JobsQueuePanelProps) {
  const totalCount = jobsQueue.queues.reduce((sum, section) => sum + section.totalCount, 0);

  return (
    <section aria-label="Jobs queue" style={styles.workspacePanel}>
      <div style={styles.row}>
        <div>
          <h1 style={styles.compactTitle}>Jobs</h1>
          <p style={styles.muted}>{totalCount} active</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={onNewJob}>
          New job
        </button>
      </div>

      <div style={styles.queueGrid}>
        {jobsQueue.queues.map((section) => (
          <QueueColumn
            key={section.key}
            section={section}
            onOpenJobDetail={onOpenJobDetail}
            onLoadMoreQueue={onLoadMoreQueue}
          />
        ))}
      </div>
    </section>
  );
}

function QueueColumn({
  section,
  onOpenJobDetail,
  onLoadMoreQueue
}: {
  section: JobsQueueSection;
  onOpenJobDetail: JobsQueuePanelProps['onOpenJobDetail'];
  onLoadMoreQueue?: JobsQueuePanelProps['onLoadMoreQueue'];
}) {
  const title = queueLabels[section.key];

  return (
    <section style={styles.panel} aria-label={`${title} jobs`}>
      <div style={styles.row}>
        <strong>{title}</strong>
        <span style={styles.badge}>{section.totalCount}</span>
      </div>
      {section.jobs.length === 0 ? (
        <p style={styles.tinyMuted}>None</p>
      ) : (
        <div style={styles.listCompact}>
          {section.jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              style={{ ...styles.cardButton, ...queueJobCardStyle }}
              onClick={() => onOpenJobDetail(job.id)}
            >
              <div style={queueJobHeaderStyle}>
                <strong>Job {job.jobNumber}</strong>
                <span style={job.needsOfficeReview ? styles.dangerBadge : styles.badge}>
                  {jobStatusLabels[job.status]}
                </span>
              </div>
              <span style={queueSummaryStyle}>{job.summary}</span>
              <div style={queueFactsStyle}>
                <QueueFact label="Location" value={job.locationName} />
                <QueueFact label="Next" value={nextAppointmentLabel(job)} />
              </div>
            </button>
          ))}
          {section.nextCursor && onLoadMoreQueue ? (
            <button
              type="button"
              style={styles.button}
              onClick={() => onLoadMoreQueue(section.key, section.nextCursor!)}
            >
              Load more
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function QueueFact({ label, value }: { label: string; value: string }) {
  return (
    <span style={queueFactStyle}>
      <span style={styles.tinyMuted}>{label}</span>
      <strong style={queueFactValueStyle}>{value}</strong>
    </span>
  );
}

function nextAppointmentLabel(job: JobsQueueItem): string {
  return job.nextAppointment
    ? formatAppointmentScheduleDisplay(job.nextAppointment)
    : 'No appointment';
}

const queueJobCardStyle: CSSProperties = {
  gap: '0.55rem',
  padding: '0.7rem'
};

const queueJobHeaderStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'space-between',
  minWidth: 0
};

const queueSummaryStyle: CSSProperties = {
  color: '#1f2933',
  display: '-webkit-box',
  fontSize: '0.9rem',
  lineHeight: 1.35,
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2
};

const queueFactsStyle: CSSProperties = {
  display: 'grid',
  gap: '0.35rem'
};

const queueFactStyle: CSSProperties = {
  display: 'grid',
  gap: '0.1rem',
  minWidth: 0
};

const queueFactValueStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};
