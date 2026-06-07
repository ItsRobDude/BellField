'use client';

import type { CSSProperties } from 'react';
import type { JobStatus, JobSummary } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export const jobStatusLabels: Record<JobStatus, string> = {
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

type JobOverviewSectionProps = {
  job: JobSummary;
  onOpenCustomer: (customerId: string, sourceJobId: string) => void;
  onOpenLocation: (locationId: string, sourceJobId: string) => void;
  onJobStatusReviewRequested: (
    jobId: string,
    currentStatus: JobStatus,
    status: JobStatus,
    summary: string
  ) => void;
};

export function JobOverviewSection({
  job,
  onOpenCustomer,
  onOpenLocation,
  onJobStatusReviewRequested
}: JobOverviewSectionProps) {
  return (
    <div style={styles.detailGrid}>
      <section style={styles.panel}>
        <div style={styles.formGridCompact}>
          <DetailField
            label="Location"
            value={job.locationName}
            actionLabel={`Open location ${job.locationName}`}
            onOpen={() => onOpenLocation(job.locationId, job.id)}
          />
          <DetailField
            label="Customer"
            value={job.billToCustomerName}
            actionLabel={`Open customer ${job.billToCustomerName}`}
            onOpen={() => onOpenCustomer(job.billToCustomerId, job.id)}
          />
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

function DetailField({
  label,
  value,
  actionLabel,
  onOpen
}: {
  label: string;
  value: string;
  actionLabel?: string;
  onOpen?: () => void;
}) {
  return (
    <div>
      <div style={styles.tinyMuted}>{label}</div>
      {onOpen ? (
        <button
          type="button"
          aria-label={actionLabel}
          style={styles.tableLinkButton}
          onClick={onOpen}
        >
          {value}
        </button>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.85rem',
  fontWeight: 700
};
