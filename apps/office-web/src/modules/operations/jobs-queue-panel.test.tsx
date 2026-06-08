import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobsQueueKey, JobsQueueResponse } from '@/lib/operations-api';
import { JobsQueuePanel } from './jobs-queue-panel';

const baseTimestamp = '2026-05-22T10:00:00.000Z';

type QueueItem = JobsQueueResponse['queues'][number]['jobs'][number];

function buildQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 'job-1',
    jobNumber: '1001',
    locationId: 'location-1',
    locationName: 'Main Shop',
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme',
    jobType: 'Service',
    category: 'General',
    origin: 'Inbound phone call',
    summary: 'No cooling',
    status: 'scheduled',
    needsScheduling: false,
    needsOfficeReview: false,
    nextAppointment: {
      id: 'appt-1',
      jobId: 'job-1',
      scheduledDate: '2026-05-23',
      scheduledStartTime: '08:00',
      scheduledEndTime: '10:00',
      technicianId: 'tech-1',
      technicianName: 'Taylor Tech',
      status: 'scheduled',
      needsOfficeReview: false
    },
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildJobsQueue(
  overrides: Partial<Record<JobsQueueKey, QueueItem[]>> = {}
): JobsQueueResponse {
  const sections: JobsQueueResponse['queues'] = [
    { key: 'review', totalCount: overrides.review?.length ?? 0, jobs: overrides.review ?? [] },
    {
      key: 'waitingOnParts',
      totalCount: overrides.waitingOnParts?.length ?? 0,
      jobs: overrides.waitingOnParts ?? []
    },
    {
      key: 'unscheduled',
      totalCount: overrides.unscheduled?.length ?? 0,
      jobs: overrides.unscheduled ?? []
    },
    { key: 'open', totalCount: overrides.open?.length ?? 0, jobs: overrides.open ?? [] }
  ];

  return {
    limit: 20,
    queues: sections
  };
}

describe('JobsQueuePanel', () => {
  it('renders server-provided jobs in one worklist with queue filters', () => {
    const jobsQueue = buildJobsQueue({
      review: [
        buildQueueItem({
          id: 'job-review',
          jobNumber: '1001',
          summary: 'Review this',
          needsOfficeReview: true
        })
      ],
      waitingOnParts: [
        buildQueueItem({
          id: 'job-waiting',
          jobNumber: '1002',
          summary: 'Waiting for part',
          status: 'waitingOnParts'
        })
      ],
      unscheduled: [
        buildQueueItem({
          id: 'job-unscheduled',
          jobNumber: '1003',
          summary: 'Needs date',
          status: 'new',
          needsScheduling: true,
          nextAppointment: undefined
        })
      ],
      open: [buildQueueItem({ id: 'job-open', jobNumber: '1004', summary: 'Regular work' })]
    });

    render(<JobsQueuePanel jobsQueue={jobsQueue} onOpenJobDetail={vi.fn()} onNewJob={vi.fn()} />);

    const filters = within(screen.getByRole('toolbar', { name: 'Job queue filters' }));
    expect(filters.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(filters.getByRole('button', { name: 'Review 1' })).toBeInTheDocument();
    expect(filters.getByRole('button', { name: 'Waiting 1' })).toBeInTheDocument();
    expect(filters.getByRole('button', { name: 'Unscheduled 1' })).toBeInTheDocument();
    expect(filters.getByRole('button', { name: 'Open 1' })).toBeInTheDocument();

    const worklist = within(screen.getByRole('region', { name: 'Jobs worklist' }));
    expect(worklist.getByText('Review this')).toBeInTheDocument();
    expect(worklist.getByText('Waiting for part')).toBeInTheDocument();
    expect(worklist.getByText('Needs date')).toBeInTheDocument();
    expect(worklist.getByText('Regular work')).toBeInTheDocument();
    expect(screen.getByText('4 active')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Review jobs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Open jobs' })).not.toBeInTheDocument();
  });

  it('filters the worklist without dedicating space to empty buckets', () => {
    const jobsQueue = buildJobsQueue({
      waitingOnParts: [
        buildQueueItem({
          id: 'job-waiting',
          jobNumber: '1002',
          summary: 'Waiting for part',
          status: 'waitingOnParts'
        })
      ],
      open: [buildQueueItem({ id: 'job-open', jobNumber: '1004', summary: 'Regular work' })]
    });

    render(<JobsQueuePanel jobsQueue={jobsQueue} onOpenJobDetail={vi.fn()} onNewJob={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Waiting 1' }));

    let worklist = within(screen.getByRole('region', { name: 'Jobs worklist' }));
    expect(worklist.getByText('Waiting for part')).toBeInTheDocument();
    expect(worklist.queryByText('Regular work')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review 0' }));

    worklist = within(screen.getByRole('region', { name: 'Jobs worklist' }));
    expect(worklist.getByText('No review jobs.')).toBeInTheDocument();
  });

  it('opens job detail from a queue card and keeps the new-job action focused', () => {
    const onOpenJobDetail = vi.fn();
    const onNewJob = vi.fn();
    const jobsQueue = buildJobsQueue({
      review: [
        buildQueueItem({
          id: 'job-review',
          jobNumber: '1001',
          summary: 'Review this',
          needsOfficeReview: true,
          nextAppointment: {
            id: 'appt-review',
            jobId: 'job-review',
            status: 'finished',
            needsOfficeReview: true
          }
        })
      ]
    });

    render(
      <JobsQueuePanel jobsQueue={jobsQueue} onOpenJobDetail={onOpenJobDetail} onNewJob={onNewJob} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Job 1001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'New job' }));

    expect(onOpenJobDetail).toHaveBeenCalledWith('job-review');
    expect(onNewJob).toHaveBeenCalled();
  });

  it('loads the next page for a queue when the server provides a cursor', () => {
    const onLoadMoreQueue = vi.fn();
    const jobsQueue = buildJobsQueue({
      open: [buildQueueItem({ id: 'job-open', jobNumber: '1004', summary: 'Regular work' })]
    });
    jobsQueue.queues = jobsQueue.queues.map((section) =>
      section.key === 'open' ? { ...section, totalCount: 2, nextCursor: 'cursor-1' } : section
    );

    render(
      <JobsQueuePanel
        jobsQueue={jobsQueue}
        onOpenJobDetail={vi.fn()}
        onNewJob={vi.fn()}
        onLoadMoreQueue={onLoadMoreQueue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more Open' }));

    expect(onLoadMoreQueue).toHaveBeenCalledWith('open', 'cursor-1');
  });
});
