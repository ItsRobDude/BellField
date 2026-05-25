'use client';

import type { JobsQueueKey, JobsQueueResponse } from '@/lib/operations-api';
import type { JobDetailTab } from './job-work-types';
import { JobsQueuePanel } from './jobs-queue-panel';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeJobsQueueSurfaceProps = {
  jobsQueue: JobsQueueResponse | null;
  onOpenJobDetail: (jobId: string, appointmentId?: string, initialTab?: JobDetailTab) => void;
  onOpenJobIntake: () => void;
  onLoadMoreJobsQueue: (queueKey: JobsQueueKey, cursor: string) => Promise<void>;
};

export function OfficeJobsQueueSurface({
  jobsQueue,
  onOpenJobDetail,
  onOpenJobIntake,
  onLoadMoreJobsQueue
}: OfficeJobsQueueSurfaceProps) {
  if (!jobsQueue) {
    return (
      <section style={styles.workspacePanel} aria-label="Jobs queue">
        <p style={styles.muted}>Loading jobs...</p>
      </section>
    );
  }

  return (
    <JobsQueuePanel
      jobsQueue={jobsQueue}
      onOpenJobDetail={(jobId, appointmentId) => onOpenJobDetail(jobId, appointmentId)}
      onNewJob={onOpenJobIntake}
      onLoadMoreQueue={(queueKey, cursor) => void onLoadMoreJobsQueue(queueKey, cursor)}
    />
  );
}
