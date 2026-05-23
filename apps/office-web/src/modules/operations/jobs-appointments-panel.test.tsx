import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobStatus, JobSummary, JobsWorkspaceResponse } from '@/lib/operations-api';
import { JobsAppointmentsPanel, type CapturedWorkDetails } from './jobs-appointments-panel';

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
  onAddAppointment?: ReturnType<typeof vi.fn<(jobId: string) => Promise<void>>>;
  onKeepJobOpen?: ReturnType<typeof vi.fn<(jobId: string) => Promise<void>>>;
  appointmentEditDrafts?: Parameters<typeof JobsAppointmentsPanel>[0]['appointmentEditDrafts'];
  onAppointmentEditDraftChange?: Parameters<typeof JobsAppointmentsPanel>[0]['onAppointmentEditDraftChange'];
  onSaveAppointmentSchedule?: Parameters<typeof JobsAppointmentsPanel>[0]['onSaveAppointmentSchedule'];
  capturedWorkByJobId?: Record<string, CapturedWorkDetails>;
  onToggleCapturedWork?: Parameters<typeof JobsAppointmentsPanel>[0]['onToggleCapturedWork'];
  focusedJobId?: string | null;
}) {
  const onJobStatusReviewRequested = input.onJobStatusReviewRequested ?? vi.fn<JobStatusReviewHandler>();
  const onAddAppointment = input.onAddAppointment ?? vi.fn(async () => undefined);
  const onKeepJobOpen = input.onKeepJobOpen ?? vi.fn(async () => undefined);

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
      jobStartTime=""
      jobEndTime=""
      jobWindow=""
      appointmentDrafts={{}}
      appointmentEditDrafts={input.appointmentEditDrafts ?? {}}
      onJobLocationChange={vi.fn()}
      onJobBillToCustomerChange={vi.fn()}
      onJobTypeChange={vi.fn()}
      onJobCategoryChange={vi.fn()}
      onJobOriginChange={vi.fn()}
      onJobSummaryChange={vi.fn()}
      onJobTechnicianChange={vi.fn()}
      onJobDateChange={vi.fn()}
      onJobStartTimeChange={vi.fn()}
      onJobEndTimeChange={vi.fn()}
      onJobWindowChange={vi.fn()}
      onAppointmentDraftChange={vi.fn()}
      onAppointmentEditDraftChange={input.onAppointmentEditDraftChange ?? vi.fn()}
      onCreateJob={noopAsync}
      pendingJobStatusChange={null}
      onJobStatusReviewRequested={onJobStatusReviewRequested}
      onConfirmJobStatusChange={noopAsync}
      onCancelJobStatusChange={vi.fn()}
      onAppointmentStatusChange={noopAsync}
      onSaveAppointmentSchedule={input.onSaveAppointmentSchedule ?? noopAsync}
      onAddAppointment={onAddAppointment}
      onKeepJobOpen={onKeepJobOpen}
      capturedWorkByJobId={input.capturedWorkByJobId ?? {}}
      onToggleCapturedWork={input.onToggleCapturedWork ?? noopAsync}
      onRegisterDraftChange={vi.fn()}
      onSaveRegisterEntry={noopAsync}
      onRegisterVoidReasonChange={vi.fn()}
      onVoidRegisterEntry={noopAsync}
      onMediaCaptionChange={vi.fn()}
      onSaveMediaCaption={noopAsync}
      onMediaVoidReasonChange={vi.fn()}
      onVoidMediaAttachment={noopAsync}
      onOpenMediaAttachment={noopAsync}
      focusedJobId={input.focusedJobId}
    />
  );

  return { onJobStatusReviewRequested, onAddAppointment, onKeepJobOpen };
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
    expect(screen.getByText(/Pick how the office wants to handle this job/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark job completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule follow-up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep job open' })).toBeInTheDocument();
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

  it('uses the existing add-appointment flow when scheduling follow-up from review', () => {
    const onAddAppointment = vi.fn(async () => undefined);

    renderJobsPanel({
      jobs: [createJob({ needsOfficeReview: true })],
      onAddAppointment
    });

    fireEvent.click(screen.getByRole('button', { name: 'Schedule follow-up' }));

    expect(onAddAppointment).toHaveBeenCalledWith('job-1');
  });

  it('acknowledges review without changing status when keeping the job open', () => {
    const onKeepJobOpen = vi.fn(async () => undefined);

    renderJobsPanel({
      jobs: [createJob({ needsOfficeReview: true })],
      onKeepJobOpen
    });

    fireEvent.click(screen.getByRole('button', { name: 'Keep job open' }));

    expect(onKeepJobOpen).toHaveBeenCalledWith('job-1');
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

  it('marks a focused job as the current jump target', () => {
    renderJobsPanel({
      focusedJobId: 'job-2',
      jobs: [
        createJob({ id: 'job-1', jobNumber: '1001', summary: 'No cooling' }),
        createJob({ id: 'job-2', jobNumber: '1002', summary: 'Heat not working' })
      ]
    });

    const focusedJob = screen.getByText(/Job 1002: Heat not working/i).closest('article');
    const otherJob = screen.getByText(/Job 1001: No cooling/i).closest('article');

    expect(focusedJob).toHaveAttribute('id', 'office-job-job-2');
    expect(focusedJob).toHaveAttribute('aria-current', 'true');
    expect(otherJob).not.toHaveAttribute('aria-current');
  });

  it('shows structured appointment times and edits them as a full schedule draft', () => {
    const onAppointmentEditDraftChange = vi.fn();
    const onSaveAppointmentSchedule = vi.fn(async () => undefined);

    renderJobsPanel({
      jobs: [
        createJob({
          appointments: [
            {
              id: 'appointment-1',
              jobId: 'job-1',
              scheduledDate: '2026-04-15',
              scheduledStartTime: '08:00',
              scheduledEndTime: '10:00',
              timeWindowLabel: 'Morning',
              status: 'scheduled',
              needsOfficeReview: false,
              createdAt: '2026-04-14T10:00:00.000Z',
              updatedAt: '2026-04-14T11:00:00.000Z'
            }
          ]
        })
      ],
      onAppointmentEditDraftChange,
      onSaveAppointmentSchedule
    });

    expect(screen.getByText('8:00 AM - 10:00 AM - Unassigned')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Appointment start time'), {
      target: { value: '09:00' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }));

    expect(onAppointmentEditDraftChange).toHaveBeenCalledWith('appointment-1', {
      scheduledDate: '2026-04-15',
      scheduledStartTime: '09:00',
      scheduledEndTime: '10:00',
      timeWindowLabel: 'Morning',
      technicianId: ''
    });
    expect(onSaveAppointmentSchedule).toHaveBeenCalledWith('appointment-1');
  });
});
