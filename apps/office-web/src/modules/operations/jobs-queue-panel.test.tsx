import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppointmentSummary, JobSummary, JobsWorkspaceResponse } from '@/lib/operations-api';
import { JobsQueuePanel } from './jobs-queue-panel';

const baseTimestamp = '2026-05-22T10:00:00.000Z';

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appt-1',
    jobId: 'job-1',
    status: 'scheduled',
    needsOfficeReview: false,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildJob(overrides: Partial<JobSummary> = {}): JobSummary {
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
    appointments: [buildAppointment()],
    timeline: [],
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildWorkspace(jobs: JobSummary[]): JobsWorkspaceResponse {
  return {
    customers: [],
    locations: [],
    technicians: [],
    jobs
  };
}

describe('JobsQueuePanel', () => {
  it('groups jobs into review, unscheduled, and open queues', () => {
    const workspace = buildWorkspace([
      buildJob({ id: 'job-review', jobNumber: '1001', summary: 'Review this', needsOfficeReview: true }),
      buildJob({ id: 'job-unscheduled', jobNumber: '1002', summary: 'Needs date', status: 'new', needsScheduling: true }),
      buildJob({ id: 'job-open', jobNumber: '1003', summary: 'Regular work' })
    ]);

    render(<JobsQueuePanel jobsWorkspace={workspace} onOpenJobDetail={vi.fn()} onNewJob={vi.fn()} />);

    expect(within(screen.getByRole('region', { name: 'Review jobs' })).getByText('Review this')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Unscheduled jobs' })).getByText('Needs date')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Open jobs' })).getByText('Regular work')).toBeInTheDocument();
  });

  it('opens job detail from a queue card and keeps the new-job action focused', () => {
    const onOpenJobDetail = vi.fn();
    const onNewJob = vi.fn();
    const workspace = buildWorkspace([
      buildJob({
        id: 'job-review',
        jobNumber: '1001',
        summary: 'Review this',
        needsOfficeReview: true,
        appointments: [buildAppointment({ id: 'appt-review', jobId: 'job-review' })]
      })
    ]);

    render(<JobsQueuePanel jobsWorkspace={workspace} onOpenJobDetail={onOpenJobDetail} onNewJob={onNewJob} />);

    fireEvent.click(screen.getByRole('button', { name: /Job 1001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'New job' }));

    expect(onOpenJobDetail).toHaveBeenCalledWith('job-review', 'appt-review');
    expect(onNewJob).toHaveBeenCalled();
  });
});
