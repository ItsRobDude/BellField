'use client';

import { useMemo, useState } from 'react';
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
type QueueFilterKey = 'all' | JobsQueueKey;
type VisibleQueueJob = {
  job: JobsQueueItem;
  queueKey: JobsQueueKey;
};

const queueLabels: Record<JobsQueueKey, string> = {
  review: 'Review',
  waitingOnParts: 'Waiting',
  unscheduled: 'Unscheduled',
  open: 'Open'
};

const filterLabels: Record<QueueFilterKey, string> = {
  all: 'All',
  ...queueLabels
};

const queueOrder: JobsQueueKey[] = ['review', 'waitingOnParts', 'unscheduled', 'open'];

export function JobsQueuePanel({
  jobsQueue,
  onOpenJobDetail,
  onNewJob,
  onLoadMoreQueue
}: JobsQueuePanelProps) {
  const [activeFilter, setActiveFilter] = useState<QueueFilterKey>('all');
  const totalCount = jobsQueue.queues.reduce((sum, section) => sum + section.totalCount, 0);
  const sectionByKey = useMemo(
    () => new Map(jobsQueue.queues.map((section) => [section.key, section])),
    [jobsQueue.queues]
  );
  const visibleJobs = useMemo<VisibleQueueJob[]>(() => {
    if (activeFilter === 'all') {
      return queueOrder.flatMap((key) =>
        (sectionByKey.get(key)?.jobs ?? []).map((job) => ({ job, queueKey: key }))
      );
    }

    return (sectionByKey.get(activeFilter)?.jobs ?? []).map((job) => ({
      job,
      queueKey: activeFilter
    }));
  }, [activeFilter, sectionByKey]);
  const filterOptions = useMemo(
    () => [
      { key: 'all' as const, count: totalCount },
      ...queueOrder.map((key) => ({ key, count: sectionByKey.get(key)?.totalCount ?? 0 }))
    ],
    [sectionByKey, totalCount]
  );
  const loadMoreSections =
    activeFilter === 'all'
      ? queueOrder
          .map((key) => sectionByKey.get(key))
          .filter((section): section is JobsQueueSection => Boolean(section?.nextCursor))
      : [sectionByKey.get(activeFilter)].filter((section): section is JobsQueueSection =>
          Boolean(section?.nextCursor)
        );

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

      <div aria-label="Job queue filters" role="toolbar" style={filterBarStyle}>
        {filterOptions.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              aria-label={`${filterLabels[filter.key]} ${filter.count}`}
              aria-pressed={isActive}
              style={{
                ...filterChipStyle,
                ...(isActive ? activeFilterChipStyle : undefined)
              }}
              onClick={() => setActiveFilter(filter.key)}
            >
              <span>{filterLabels[filter.key]}</span>
              <strong>{filter.count}</strong>
            </button>
          );
        })}
      </div>

      <section aria-label="Jobs worklist" style={worklistPanelStyle}>
        <div style={worklistHeaderStyle}>
          <span>Job</span>
          <span>Location</span>
          <span>Next</span>
          <span>Assigned</span>
          <span>Updated</span>
          <span>Status</span>
        </div>

        {visibleJobs.length === 0 ? (
          <p style={emptyWorklistStyle}>{emptyQueueMessage(activeFilter)}</p>
        ) : (
          <div style={worklistRowsStyle}>
            {visibleJobs.map(({ job, queueKey }) => (
              <JobWorklistRow
                key={`${queueKey}-${job.id}`}
                filterKey={queueKey}
                job={job}
                onOpenJobDetail={onOpenJobDetail}
              />
            ))}
          </div>
        )}

        {loadMoreSections.length > 0 && onLoadMoreQueue ? (
          <div style={loadMoreBarStyle}>
            {loadMoreSections.map((section) => (
              <button
                key={section.key}
                type="button"
                style={styles.button}
                onClick={() => onLoadMoreQueue(section.key, section.nextCursor!)}
              >
                Load more {queueLabels[section.key]}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function JobWorklistRow({
  filterKey,
  job,
  onOpenJobDetail
}: {
  filterKey: JobsQueueKey;
  job: JobsQueueItem;
  onOpenJobDetail: JobsQueuePanelProps['onOpenJobDetail'];
}) {
  return (
    <button
      type="button"
      style={worklistRowButtonStyle}
      onClick={() => onOpenJobDetail(job.id)}
      aria-label={`Job ${job.jobNumber}, ${job.locationName}, ${nextAppointmentLabel(job)}`}
    >
      <span style={jobCellStyle}>
        <span style={jobTitleRowStyle}>
          <strong>Job {job.jobNumber}</strong>
          <span style={queueBadgeStyle}>{queueLabels[filterKey]}</span>
          {job.needsOfficeReview ? <span style={styles.dangerBadge}>Review</span> : null}
        </span>
        <span style={queueSummaryStyle}>{job.summary}</span>
        <span style={jobMetaStyle}>
          {job.jobType}
          {job.category ? ` / ${job.category}` : ''}
          {job.workOrderNumber ? ` / WO ${job.workOrderNumber}` : ''}
        </span>
      </span>
      <QueueFact label="Location" value={job.locationName} />
      <QueueFact label="Next" value={nextAppointmentLabel(job)} />
      <QueueFact label="Assigned" value={nextAppointmentTechnicianLabel(job)} />
      <QueueFact label="Updated" value={formatShortDate(job.updatedAt)} />
      <span style={job.needsOfficeReview ? styles.dangerBadge : styles.badge}>
        {jobStatusLabels[job.status]}
      </span>
    </button>
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

function nextAppointmentTechnicianLabel(job: JobsQueueItem): string {
  return job.nextAppointment?.technicianName ?? 'Unassigned';
}

function formatShortDate(value: string): string {
  if (!value) {
    return 'Unknown';
  }

  return value.slice(0, 10);
}

function emptyQueueMessage(activeFilter: QueueFilterKey): string {
  if (activeFilter === 'all') {
    return 'No active jobs.';
  }

  return `No ${queueLabels[activeFilter].toLowerCase()} jobs.`;
}

const filterBarStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem'
};

const filterChipStyle: CSSProperties = {
  alignItems: 'center',
  background: '#ffffff',
  border: '1px solid #cfd8d2',
  borderRadius: 999,
  color: '#1f2933',
  cursor: 'pointer',
  display: 'inline-flex',
  gap: '0.45rem',
  fontSize: '0.9rem',
  fontWeight: 800,
  padding: '0.45rem 0.7rem'
};

const activeFilterChipStyle: CSSProperties = {
  background: '#e8f2ee',
  borderColor: '#176b5b',
  color: '#0f4f43'
};

const worklistPanelStyle: CSSProperties = {
  border: '1px solid #dfe6df',
  borderRadius: 8,
  display: 'grid',
  minWidth: 0,
  overflowX: 'auto',
  overflowY: 'hidden'
};

const worklistHeaderStyle: CSSProperties = {
  background: '#f7f8f6',
  borderBottom: '1px solid #dfe6df',
  color: '#52606d',
  display: 'grid',
  fontSize: '0.75rem',
  fontWeight: 900,
  gap: '0.75rem',
  gridTemplateColumns:
    'minmax(18rem, 1.8fr) minmax(10rem, 1fr) minmax(13rem, 1.1fr) minmax(8rem, 0.7fr) minmax(7rem, 0.6fr) auto',
  minWidth: '66rem',
  padding: '0.65rem 0.8rem',
  textTransform: 'uppercase'
};

const worklistRowsStyle: CSSProperties = {
  display: 'grid'
};

const worklistRowButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: '#ffffff',
  border: 'none',
  borderBottom: '1px solid #edf2ee',
  color: '#1f2933',
  cursor: 'pointer',
  display: 'grid',
  font: 'inherit',
  gap: '0.75rem',
  gridTemplateColumns:
    'minmax(18rem, 1.8fr) minmax(10rem, 1fr) minmax(13rem, 1.1fr) minmax(8rem, 0.7fr) minmax(7rem, 0.6fr) auto',
  minHeight: '4.5rem',
  minWidth: '66rem',
  padding: '0.7rem 0.8rem',
  textAlign: 'left',
  width: '100%'
};

const jobCellStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  minWidth: 0
};

const jobTitleRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: '0.5rem',
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

const jobMetaStyle: CSSProperties = {
  color: '#52606d',
  fontSize: '0.8rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const queueBadgeStyle: CSSProperties = {
  background: '#f0f4f1',
  borderRadius: 999,
  color: '#52606d',
  fontSize: '0.75rem',
  fontWeight: 900,
  padding: '0.2rem 0.5rem',
  whiteSpace: 'nowrap'
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

const emptyWorklistStyle: CSSProperties = {
  color: '#52606d',
  margin: 0,
  padding: '1rem'
};

const loadMoreBarStyle: CSSProperties = {
  alignItems: 'center',
  background: '#ffffff',
  borderTop: '1px solid #edf2ee',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  padding: '0.75rem 0.8rem'
};
