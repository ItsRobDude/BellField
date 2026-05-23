import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppointmentStatus,
  AppointmentSummary,
  JobStatus,
  JobSummary,
  JobsWorkspaceResponse
} from '@/lib/operations-api';
import { buildDispatchBoardModel } from './dispatch-board-data';
import { DispatchBoardPanel } from './dispatch-board-panel';

const baseTimestamp = '2026-05-22T10:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appt-1',
    jobId: 'job-1',
    status: 'scheduled' as AppointmentStatus,
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
    status: 'scheduled' as JobStatus,
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
      { id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' },
      { id: 'tech-2', displayName: 'Sam Tech', roleId: 'technician' }
    ],
    jobs
  };
}

describe('buildDispatchBoardModel', () => {
  it('groups assigned appointments under technician rows and lists unassigned ones in the queue', () => {
    const workspace = buildWorkspace([
      buildJob({
        id: 'job-1',
        jobNumber: '1001',
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '8-10'
          })
        ]
      }),
      buildJob({
        id: 'job-2',
        jobNumber: '1002',
        appointments: [
          buildAppointment({
            id: 'appt-unassigned',
            jobId: 'job-2',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '1-3'
          })
        ]
      }),
      buildJob({
        id: 'job-3',
        jobNumber: '1003',
        appointments: [
          buildAppointment({
            id: 'appt-tech2',
            jobId: 'job-3',
            technicianId: 'tech-2',
            technicianName: 'Sam Tech',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '10-12'
          })
        ]
      })
    ]);

    const model = buildDispatchBoardModel(workspace);

    expect(model.technicianRows).toHaveLength(2);
    expect(model.technicianRows[0]?.technicianId).toBe('tech-1');
    expect(model.technicianRows[0]?.cards.map((card) => card.appointmentId)).toEqual(['appt-tech1']);
    expect(model.technicianRows[1]?.cards.map((card) => card.appointmentId)).toEqual(['appt-tech2']);
    expect(model.unassignedQueue.map((card) => card.appointmentId)).toEqual(['appt-unassigned']);
    expect(model.cardLookup.size).toBe(3);
  });

  it('hides cancelled jobs and cancelled appointments from the board', () => {
    const workspace = buildWorkspace([
      buildJob({
        id: 'job-cancelled-job',
        status: 'cancelled',
        appointments: [buildAppointment({ id: 'appt-from-cancel', jobId: 'job-cancelled-job' })]
      }),
      buildJob({
        id: 'job-with-cancelled-appt',
        appointments: [
          buildAppointment({ id: 'appt-cancelled', jobId: 'job-with-cancelled-appt', status: 'cancelled' }),
          buildAppointment({ id: 'appt-active', jobId: 'job-with-cancelled-appt' })
        ]
      })
    ]);

    const model = buildDispatchBoardModel(workspace);
    const visibleIds = [...model.cardLookup.keys()].sort();

    expect(visibleIds).toEqual(['appt-active']);
  });

  it('filters by viewDate when one is supplied', () => {
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({ id: 'appt-today', scheduledDate: '2026-05-22', technicianId: 'tech-1' }),
          buildAppointment({ id: 'appt-tomorrow', scheduledDate: '2026-05-23', technicianId: 'tech-1' }),
          buildAppointment({ id: 'appt-unscheduled', technicianId: 'tech-1' })
        ]
      })
    ]);

    const model = buildDispatchBoardModel(workspace, '2026-05-22');

    expect(model.cardLookup.size).toBe(1);
    expect(model.cardLookup.has('appt-today')).toBe(true);
  });

  it('sorts cards by scheduled date, structured start time, and job number', () => {
    const workspace = buildWorkspace([
      buildJob({
        id: 'job-untimed',
        jobNumber: '1001',
        appointments: [
          buildAppointment({
            id: 'appt-untimed',
            jobId: 'job-untimed',
            technicianId: 'tech-1',
            scheduledDate: '2026-05-22'
          })
        ]
      }),
      buildJob({
        id: 'job-late',
        jobNumber: '1002',
        appointments: [
          buildAppointment({
            id: 'appt-late',
            jobId: 'job-late',
            technicianId: 'tech-1',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '13:00'
          })
        ]
      }),
      buildJob({
        id: 'job-early',
        jobNumber: '1003',
        appointments: [
          buildAppointment({
            id: 'appt-early',
            jobId: 'job-early',
            technicianId: 'tech-1',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '08:00'
          })
        ]
      })
    ]);

    const model = buildDispatchBoardModel(workspace, '2026-05-22');
    const techRow = model.technicianRows.find((row) => row.technicianId === 'tech-1');

    expect(techRow?.cards.map((card) => card.appointmentId)).toEqual(['appt-early', 'appt-late', 'appt-untimed']);
  });
});

describe('DispatchBoardPanel', () => {
  it('renders a compact dated board with technician rows and unassigned work', () => {
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22'
          })
        ]
      }),
      buildJob({
        id: 'job-2',
        jobNumber: '1002',
        summary: 'Heat not working',
        appointments: [buildAppointment({ id: 'appt-unassigned', jobId: 'job-2', scheduledDate: '2026-05-22' })]
      })
    ]);

    render(<DispatchBoardPanel jobsWorkspace={workspace} viewDate="2026-05-22" />);

    expect(screen.getByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dispatch' })).toBeInTheDocument();
    expect(screen.getByText('Taylor Tech')).toBeInTheDocument();
    expect(screen.getByText('Sam Tech')).toBeInTheDocument();

    const unassignedRegion = screen.getByRole('region', { name: /Unassigned appointments/i });
    const taylorRegion = screen.getByRole('region', { name: /Appointments for Taylor Tech/i });
    const samRegion = screen.getByRole('region', { name: /Appointments for Sam Tech/i });

    expect(within(unassignedRegion).getByText(/Job 1002/)).toBeInTheDocument();
    expect(within(taylorRegion).getByText(/Job 1001/)).toBeInTheDocument();
    expect(unassignedRegion.compareDocumentPosition(taylorRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(taylorRegion.compareDocumentPosition(samRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('surfaces a controlled dispatch date input', () => {
    const onViewDateChange = vi.fn();
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel jobsWorkspace={workspace} viewDate="2026-05-22" onViewDateChange={onViewDateChange} />
    );

    fireEvent.change(screen.getByLabelText('Dispatch date'), { target: { value: '2026-05-23' } });

    expect(onViewDateChange).toHaveBeenCalledWith('2026-05-23');
  });

  it('calls refresh and reflects refresh state', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const workspace = buildWorkspace([buildJob()]);

    const { rerender } = render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        lastRefreshedAt="2026-05-22T15:30:00.000Z"
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText(/Refreshed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });

    rerender(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        lastRefreshedAt="2026-05-22T15:30:00.000Z"
        isRefreshing={true}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByRole('button', { name: 'Refreshing...' })).toBeDisabled();
    expect(screen.getAllByText('Refreshing...').length).toBeGreaterThan(0);
  });

  it('opens job detail when an appointment card is clicked', () => {
    const onOpenJobDetail = vi.fn();
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onOpenJobDetail={onOpenJobDetail}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    expect(onOpenJobDetail).toHaveBeenCalledWith('job-1', 'appt-tech1');
  });

  it('shows a review badge when the appointment or job is flagged for review', () => {
    const workspace = buildWorkspace([
      buildJob({
        needsOfficeReview: true,
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            needsOfficeReview: true,
            status: 'finished',
            finishOutcome: 'followUpNeeded'
          })
        ]
      })
    ]);

    render(<DispatchBoardPanel jobsWorkspace={workspace} viewDate="2026-05-22" />);

    expect(screen.getByText('Review')).toBeInTheDocument();
  });
});
