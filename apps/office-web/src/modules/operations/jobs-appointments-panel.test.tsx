import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobStatus, JobSummary, JobsWorkspaceResponse } from '@/lib/operations-api';
import { JobsAppointmentsPanel } from './jobs-appointments-panel';

const noopAsync = vi.fn(async () => undefined);
type JobStatusReviewHandler = (
  jobId: string,
  currentStatus: JobStatus,
  status: JobStatus,
  summary: string
) => void;

function createWorkspace(jobs: JobSummary[]): JobsWorkspaceResponse {
  return {
    customers: [
      {
        id: 'customer-1',
        name: 'Acme',
        accountType: 'company',
        billingAddressLine1: '123 Main',
        billingCity: 'Blaine',
        billingState: 'WA',
        billingPostalCode: '98230',
        isActive: true,
        flags: []
      }
    ],
    locations: [
      {
        id: 'location-1',
        name: 'Main Shop',
        customerId: 'customer-1',
        customerName: 'Acme',
        addressLine1: '123 Main',
        city: 'Blaine',
        state: 'WA',
        postalCode: '98230',
        isActive: true,
        contacts: [],
        alternateBillToCustomerIds: []
      }
    ],
    technicians: [
      {
        id: 'tech-1',
        displayName: 'Taylor Tech',
        roleId: 'technician'
      }
    ],
    jobs
  };
}

function createJob(overrides: Partial<JobSummary> = {}): JobSummary {
  const jobId = overrides.id ?? 'job-1';

  return {
    id: jobId,
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
    appointments: [],
    timeline: [],
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

function renderJobsPanel(input: {
  jobs: JobSummary[];
  onJobStatusReviewRequested?: ReturnType<typeof vi.fn<JobStatusReviewHandler>>;
}) {
  const onJobStatusReviewRequested = input.onJobStatusReviewRequested ?? vi.fn<JobStatusReviewHandler>();

  render(
    <JobsAppointmentsPanel
      jobsWorkspace={createWorkspace(input.jobs)}
      jobLocationId="location-1"
      jobBillToCustomerId="customer-1"
      jobType="Service"
      jobCategory="General"
      jobOrigin="Inbound phone call"
      jobSummary=""
      jobTechnicianId=""
      jobDate=""
      jobWindow=""
      appointmentDrafts={{}}
      appointmentEditDrafts={{}}
      onJobLocationChange={vi.fn()}
      onJobBillToCustomerChange={vi.fn()}
      onJobTypeChange={vi.fn()}
      onJobCategoryChange={vi.fn()}
      onJobOriginChange={vi.fn()}
      onJobSummaryChange={vi.fn()}
      onJobTechnicianChange={vi.fn()}
      onJobDateChange={vi.fn()}
      onJobWindowChange={vi.fn()}
      onAppointmentDraftChange={vi.fn()}
      onAppointmentEditDraftChange={vi.fn()}
      onCreateJob={noopAsync}
      pendingJobStatusChange={null}
      onJobStatusReviewRequested={onJobStatusReviewRequested}
      onConfirmJobStatusChange={noopAsync}
      onCancelJobStatusChange={vi.fn()}
      onAppointmentStatusChange={noopAsync}
      onSaveAppointmentSchedule={noopAsync}
      onAddAppointment={noopAsync}
    />
  );

  return { onJobStatusReviewRequested };
}

describe('JobsAppointmentsPanel', () => {
  it('shows finished visit review guidance for open jobs needing office review', () => {
    renderJobsPanel({
      jobs: [
        createJob({
          needsOfficeReview: true,
          appointments: [
            {
              id: 'appointment-1',
              jobId: 'job-1',
              scheduledDate: '2026-04-15',
              timeWindowLabel: '1:00 PM - 3:00 PM',
              status: 'finished',
              finishOutcome: 'followUpNeeded',
              needsOfficeReview: true,
              createdAt: '2026-04-14T10:00:00.000Z',
              updatedAt: '2026-04-14T11:00:00.000Z'
            }
          ]
        })
      ]
    });

    expect(screen.getByText('Finished visit review')).toBeInTheDocument();
    expect(screen.getByText(/Finished visits do not close the job/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark job completed' })).toBeInTheDocument();
  });

  it('uses the existing status review handler when marking a reviewed job completed', () => {
    const onJobStatusReviewRequested = vi.fn<JobStatusReviewHandler>();

    renderJobsPanel({
      jobs: [createJob({ needsOfficeReview: true })],
      onJobStatusReviewRequested
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark job completed' }));

    expect(onJobStatusReviewRequested).toHaveBeenCalledWith('job-1', 'scheduled', 'completed', 'No cooling');
  });

  it('shows reopen guidance and hides add appointment for closed jobs', () => {
    renderJobsPanel({
      jobs: [createJob({ status: 'closed' })]
    });

    const closedJob = screen.getByText(/Job 1001: No cooling/i).closest('article');

    expect(closedJob).not.toBeNull();
    expect(
      within(closedJob as HTMLElement).getByText(/Reopen this job before adding another appointment/i)
    ).toBeInTheDocument();
    expect(within(closedJob as HTMLElement).queryByRole('button', { name: 'Add appointment' })).not.toBeInTheDocument();
  });

  it('shows unscheduled jobs as valid work needing scheduling', () => {
    renderJobsPanel({
      jobs: [
        createJob({
          status: 'new',
          needsScheduling: true
        })
      ]
    });

    expect(screen.getByRole('heading', { name: 'Unscheduled jobs' })).toBeInTheDocument();
    expect(screen.getByText(/These are valid open jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/This job is still valid/i)).toBeInTheDocument();
  });
});
