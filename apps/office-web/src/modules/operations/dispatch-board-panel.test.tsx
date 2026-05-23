import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppointmentStatus,
  AppointmentSummary,
  JobStatus,
  JobSummary,
  JobsWorkspaceResponse
} from '@/lib/operations-api';
import { DispatchBoardPanel } from './dispatch-board-panel';
import { buildDispatchBoardModel } from './dispatch-board-data';

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

  it('sorts cards by scheduled date first, then by job number when dates match', () => {
    const workspace = buildWorkspace([
      buildJob({
        id: 'job-later-date',
        jobNumber: '1003',
        appointments: [
          buildAppointment({
            id: 'appt-thursday',
            jobId: 'job-later-date',
            technicianId: 'tech-1',
            scheduledDate: '2026-05-23'
          })
        ]
      }),
      buildJob({
        id: 'job-1002',
        jobNumber: '1002',
        appointments: [
          buildAppointment({
            id: 'appt-second',
            jobId: 'job-1002',
            technicianId: 'tech-1',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '2-4'
          })
        ]
      }),
      buildJob({
        id: 'job-1001',
        jobNumber: '1001',
        appointments: [
          buildAppointment({
            id: 'appt-first',
            jobId: 'job-1001',
            technicianId: 'tech-1',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    const model = buildDispatchBoardModel(workspace);
    const techRow = model.technicianRows.find((row) => row.technicianId === 'tech-1');

    expect(techRow?.cards.map((card) => card.appointmentId)).toEqual([
      'appt-first',
      'appt-second',
      'appt-thursday'
    ]);
  });

  it('sorts timed appointments before untimed same-day appointments', () => {
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
  it('renders technician rows, the unassigned queue, and an empty drawer until a card is clicked', () => {
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

    expect(screen.getByRole('region', { name: /Dispatch board v1 foundation/i })).toBeInTheDocument();
    expect(screen.getByText('Taylor Tech')).toBeInTheDocument();
    expect(screen.getByText('Sam Tech')).toBeInTheDocument();

    const unassignedRegion = screen.getByRole('region', { name: /Unassigned appointments/i });
    expect(within(unassignedRegion).getByText(/Job 1002/)).toBeInTheDocument();

    expect(screen.getByText(/Click an appointment card/i)).toBeInTheDocument();
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

    expect(screen.getByLabelText('Dispatch date')).toHaveValue('2026-05-22');
    fireEvent.change(screen.getByLabelText('Dispatch date'), { target: { value: '2026-05-23' } });

    expect(onViewDateChange).toHaveBeenCalledWith('2026-05-23');
  });

  it('surfaces dispatch refresh state and calls the refresh handler', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
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

    const { rerender } = render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        lastRefreshedAt="2026-05-22T15:30:00.000Z"
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText(/Last refreshed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh dispatch board/i }));

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

    expect(screen.getByRole('button', { name: /Refreshing dispatch/i })).toBeDisabled();
    expect(screen.getByText('Refreshing dispatch board...')).toBeInTheDocument();
  });

  it('opens the drawer when an appointment card is clicked and surfaces deep-link callback', () => {
    const onOpenInJobsPanel = vi.fn();
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '08:00',
            scheduledEndTime: '10:00',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onOpenInJobsPanel={onOpenInJobsPanel}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    expect(within(drawer).getByText('Job 1001')).toBeInTheDocument();
    expect(within(drawer).getByText('Taylor Tech')).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Dispatch appointment date')).toHaveValue('2026-05-22');
    expect(within(drawer).getByLabelText('Dispatch start time')).toHaveValue('08:00');
    expect(within(drawer).getByLabelText('Dispatch end time')).toHaveValue('10:00');
    expect(screen.getByText('2026-05-22 - 8:00 AM - 10:00 AM')).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: /Open job 1001 in the jobs panel/i }));
    expect(onOpenInJobsPanel).toHaveBeenCalledWith('job-1');
  });

  it('preserves active drawer edits when refreshed appointment data changes under the same selection', () => {
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '08:00',
            scheduledEndTime: '10:00',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);
    const refreshedWorkspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '9-11',
            status: 'confirmed'
          })
        ]
      })
    ]);

    const { rerender } = render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onSaveAppointmentSchedule={vi.fn().mockResolvedValue(undefined)}
        onUpdateAppointmentStatus={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    fireEvent.change(screen.getByLabelText('Dispatch time window'), {
      target: { value: '10-12' }
    });
    fireEvent.change(screen.getByLabelText('Dispatch appointment status'), {
      target: { value: 'dispatched' }
    });

    rerender(
      <DispatchBoardPanel
        jobsWorkspace={refreshedWorkspace}
        viewDate="2026-05-22"
        onSaveAppointmentSchedule={vi.fn().mockResolvedValue(undefined)}
        onUpdateAppointmentStatus={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByLabelText('Dispatch time window')).toHaveValue('10-12');
    expect(screen.getByLabelText('Dispatch appointment status')).toHaveValue('dispatched');
  });

  it('saves edited dispatch schedule details from the drawer', async () => {
    const onSaveAppointmentSchedule = vi.fn().mockResolvedValue(undefined);
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '08:00',
            scheduledEndTime: '10:00',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onSaveAppointmentSchedule={onSaveAppointmentSchedule}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    const saveButton = within(drawer).getByRole('button', { name: /Save dispatch changes/i });
    expect(saveButton).toBeDisabled();

    fireEvent.change(within(drawer).getByLabelText('Dispatch appointment date'), {
      target: { value: '2026-05-23' }
    });
    fireEvent.change(within(drawer).getByLabelText('Dispatch start time'), {
      target: { value: '10:00' }
    });
    fireEvent.change(within(drawer).getByLabelText('Dispatch end time'), {
      target: { value: '12:00' }
    });
    fireEvent.change(within(drawer).getByLabelText('Dispatch time window'), {
      target: { value: '10-12' }
    });
    fireEvent.change(within(drawer).getByLabelText('Dispatch technician'), {
      target: { value: 'tech-2' }
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveAppointmentSchedule).toHaveBeenCalledWith('appt-tech1', {
        scheduledDate: '2026-05-23',
        scheduledStartTime: '10:00',
        scheduledEndTime: '12:00',
        timeWindowLabel: '10-12',
        technicianId: 'tech-2'
      });
    });
  });

  it('sends a blank technician when the dispatcher selects Unassigned', async () => {
    const onSaveAppointmentSchedule = vi.fn().mockResolvedValue(undefined);
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '08:00',
            scheduledEndTime: '10:00',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onSaveAppointmentSchedule={onSaveAppointmentSchedule}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    fireEvent.change(within(drawer).getByLabelText('Dispatch technician'), {
      target: { value: '' }
    });
    fireEvent.click(within(drawer).getByRole('button', { name: /Save dispatch changes/i }));

    await waitFor(() => {
      expect(onSaveAppointmentSchedule).toHaveBeenCalledWith('appt-tech1', {
        scheduledDate: '2026-05-22',
        scheduledStartTime: '08:00',
        scheduledEndTime: '10:00',
        timeWindowLabel: '8-10',
        technicianId: ''
      });
    });
  });

  it('clears structured times when the dispatcher clears the appointment date', async () => {
    const onSaveAppointmentSchedule = vi.fn().mockResolvedValue(undefined);
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            scheduledStartTime: '08:00',
            scheduledEndTime: '10:00',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onSaveAppointmentSchedule={onSaveAppointmentSchedule}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    fireEvent.change(within(drawer).getByLabelText('Dispatch appointment date'), {
      target: { value: '' }
    });

    expect(within(drawer).getByLabelText('Dispatch start time')).toHaveValue('');
    expect(within(drawer).getByLabelText('Dispatch end time')).toHaveValue('');

    fireEvent.click(within(drawer).getByRole('button', { name: /Save dispatch changes/i }));

    await waitFor(() => {
      expect(onSaveAppointmentSchedule).toHaveBeenCalledWith('appt-tech1', {
        scheduledDate: '',
        scheduledStartTime: '',
        scheduledEndTime: '',
        timeWindowLabel: '8-10',
        technicianId: 'tech-1'
      });
    });
  });

  it('saves edited appointment status from the drawer and disables status save while unchanged or saving', async () => {
    let resolveStatusSave: () => void = () => undefined;
    const onUpdateAppointmentStatus = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStatusSave = resolve;
        })
    );
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onUpdateAppointmentStatus={onUpdateAppointmentStatus}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    const saveButton = within(drawer).getByRole('button', { name: /Save status/i });
    expect(saveButton).toBeDisabled();

    fireEvent.change(within(drawer).getByLabelText('Dispatch appointment status'), {
      target: { value: 'dispatched' }
    });
    fireEvent.click(saveButton);

    expect(onUpdateAppointmentStatus).toHaveBeenCalledWith('appt-tech1', 'dispatched');
    expect(within(drawer).getByRole('button', { name: /Saving status/i })).toBeDisabled();

    resolveStatusSave();

    await waitFor(() => {
      expect(within(drawer).getByRole('button', { name: /Save status/i })).not.toBeDisabled();
    });
  });

  it('requires confirmation before cancelling an appointment from the drawer', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onUpdateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const workspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            id: 'appt-tech1',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            scheduledDate: '2026-05-22',
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);

    render(
      <DispatchBoardPanel
        jobsWorkspace={workspace}
        viewDate="2026-05-22"
        onUpdateAppointmentStatus={onUpdateAppointmentStatus}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    fireEvent.change(within(drawer).getByLabelText('Dispatch appointment status'), {
      target: { value: 'cancelled' }
    });
    fireEvent.click(within(drawer).getByRole('button', { name: /Save status/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Cancel this appointment? It will leave the dispatch board after the workspace refreshes.'
    );
    expect(onUpdateAppointmentStatus).not.toHaveBeenCalled();
  });

  it('shows an office-review badge when the appointment or job is flagged for review', () => {
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

    expect(screen.getByText(/Office review/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));
    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    expect(within(drawer).getByText(/Needs office review/i)).toBeInTheDocument();
    expect(within(drawer).getByText(/followUpNeeded/i)).toBeInTheDocument();
  });

  it('closes the drawer when the close button is pressed', () => {
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

    render(<DispatchBoardPanel jobsWorkspace={workspace} viewDate="2026-05-22" />);
    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    const drawer = screen.getByRole('complementary', { name: /Appointment detail drawer/i });
    fireEvent.click(within(drawer).getByRole('button', { name: /Close detail drawer/i }));

    expect(screen.getByText(/Click an appointment card/i)).toBeInTheDocument();
  });
});
