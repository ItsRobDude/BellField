import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppointmentStatus,
  DispatchAppointmentSummary,
  DispatchBoardResponse,
  JobStatus
} from '@/lib/operations-api';
import { buildDispatchBoardModel } from './dispatch-board-data';
import { DispatchBoardPanel } from './dispatch-board-panel';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function buildDispatchAppointment(
  overrides: Partial<DispatchAppointmentSummary> = {}
): DispatchAppointmentSummary {
  return {
    appointmentId: 'appt-1',
    jobId: 'job-1',
    jobNumber: '1001',
    jobSummary: 'No cooling',
    jobStatus: 'scheduled' as JobStatus,
    jobType: 'Service',
    status: 'scheduled' as AppointmentStatus,
    scheduledDate: '2026-05-22',
    scheduledStartTime: '08:00',
    scheduledEndTime: '10:00',
    technicianId: 'tech-1',
    technicianName: 'Taylor Tech',
    locationId: 'location-1',
    locationName: 'Main Shop',
    locationAddressLine1: '123 Main',
    locationCity: 'Blaine',
    locationState: 'WA',
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme',
    customerName: 'Acme',
    needsOfficeReview: false,
    equipment: [],
    equipmentCount: 0,
    ...overrides
  };
}

function buildDispatchBoard(appointments: DispatchAppointmentSummary[]): DispatchBoardResponse {
  return {
    startDate: '2026-05-22',
    endDate: '2026-05-22',
    technicians: [
      { id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' },
      { id: 'tech-2', displayName: 'Sam Tech', roleId: 'technician' }
    ],
    appointments
  };
}

describe('buildDispatchBoardModel', () => {
  it('groups assigned appointments under technician rows and lists unassigned ones in the queue', () => {
    const dispatchBoard = buildDispatchBoard([
      buildDispatchAppointment({
        appointmentId: 'appt-tech1',
        technicianId: 'tech-1',
        technicianName: 'Taylor Tech',
        timeWindowLabel: '8-10'
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-unassigned',
        jobId: 'job-2',
        jobNumber: '1002',
        technicianId: undefined,
        technicianName: undefined,
        timeWindowLabel: '1-3'
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-tech2',
        jobId: 'job-3',
        jobNumber: '1003',
        technicianId: 'tech-2',
        technicianName: 'Sam Tech',
        timeWindowLabel: '10-12'
      })
    ]);

    const model = buildDispatchBoardModel(dispatchBoard);

    expect(model.technicianRows).toHaveLength(2);
    expect(model.technicianRows[0]?.technicianId).toBe('tech-1');
    expect(model.technicianRows[0]?.cards.map((card) => card.appointmentId)).toEqual([
      'appt-tech1'
    ]);
    expect(model.technicianRows[1]?.cards.map((card) => card.appointmentId)).toEqual([
      'appt-tech2'
    ]);
    expect(model.unassignedQueue.map((card) => card.appointmentId)).toEqual(['appt-unassigned']);
    expect(model.cardLookup.size).toBe(3);
  });

  it('defensively hides cancelled jobs and cancelled appointments from the board', () => {
    const dispatchBoard = buildDispatchBoard([
      buildDispatchAppointment({
        appointmentId: 'appt-from-cancelled-job',
        jobId: 'job-cancelled',
        jobStatus: 'cancelled'
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-cancelled',
        jobId: 'job-with-cancelled-appt',
        status: 'cancelled'
      }),
      buildDispatchAppointment({ appointmentId: 'appt-active' })
    ]);

    const model = buildDispatchBoardModel(dispatchBoard);
    const visibleIds = [...model.cardLookup.keys()].sort();

    expect(visibleIds).toEqual(['appt-active']);
  });

  it('sorts cards by scheduled date, structured start time, and job number', () => {
    const dispatchBoard = buildDispatchBoard([
      buildDispatchAppointment({
        appointmentId: 'appt-untimed',
        jobId: 'job-untimed',
        jobNumber: '1001',
        scheduledStartTime: undefined,
        scheduledEndTime: undefined
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-late',
        jobId: 'job-late',
        jobNumber: '1002',
        scheduledStartTime: '13:00'
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-early',
        jobId: 'job-early',
        jobNumber: '1003',
        scheduledStartTime: '08:00'
      })
    ]);

    const model = buildDispatchBoardModel(dispatchBoard);
    const techRow = model.technicianRows.find((row) => row.technicianId === 'tech-1');

    expect(techRow?.cards.map((card) => card.appointmentId)).toEqual([
      'appt-early',
      'appt-late',
      'appt-untimed'
    ]);
  });
});

describe('DispatchBoardPanel', () => {
  it('renders a compact dated board with technician rows and unassigned work', () => {
    const dispatchBoard = buildDispatchBoard([
      buildDispatchAppointment({
        appointmentId: 'appt-tech1',
        technicianId: 'tech-1',
        technicianName: 'Taylor Tech'
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-unassigned',
        jobId: 'job-2',
        jobNumber: '1002',
        jobSummary: 'Heat not working',
        technicianId: undefined,
        technicianName: undefined
      })
    ]);

    render(<DispatchBoardPanel dispatchBoard={dispatchBoard} viewDate="2026-05-22" />);

    expect(screen.getByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dispatch' })).toBeInTheDocument();
    expect(screen.getByText('Taylor Tech')).toBeInTheDocument();
    expect(screen.getByText('Sam Tech')).toBeInTheDocument();

    const unassignedRegion = screen.getByRole('region', { name: /Unassigned appointments/i });
    const taylorRegion = screen.getByRole('region', { name: /Appointments for Taylor Tech/i });
    const samRegion = screen.getByRole('region', { name: /Appointments for Sam Tech/i });

    expect(within(unassignedRegion).getByText(/Job 1002/)).toBeInTheDocument();
    expect(within(taylorRegion).getByText(/Job 1001/)).toBeInTheDocument();
    expect(
      unassignedRegion.compareDocumentPosition(taylorRegion) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      taylorRegion.compareDocumentPosition(samRegion) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('uses one shared timeline scroller for unassigned and technician rows', () => {
    const dispatchBoard = buildDispatchBoard([
      buildDispatchAppointment({
        appointmentId: 'appt-tech1',
        technicianId: 'tech-1',
        technicianName: 'Taylor Tech'
      }),
      buildDispatchAppointment({
        appointmentId: 'appt-tech2',
        jobId: 'job-2',
        jobNumber: '1002',
        technicianId: 'tech-2',
        technicianName: 'Sam Tech'
      })
    ]);

    render(<DispatchBoardPanel dispatchBoard={dispatchBoard} viewDate="2026-05-22" />);

    const timeline = screen.getByRole('group', { name: 'Dispatch timeline' });
    const unassignedRegion = screen.getByRole('region', { name: /Unassigned appointments/i });
    const taylorRegion = screen.getByRole('region', { name: /Appointments for Taylor Tech/i });
    const samRegion = screen.getByRole('region', { name: /Appointments for Sam Tech/i });

    expect(timeline).toHaveStyle({ overflowX: 'auto' });
    expect(timeline).toContainElement(unassignedRegion);
    expect(timeline).toContainElement(taylorRegion);
    expect(timeline).toContainElement(samRegion);

    [unassignedRegion, taylorRegion, samRegion].forEach((row) => {
      expect(row.children[1]).not.toHaveStyle({ overflowX: 'auto' });
    });
  });

  it('opens a calendar picker and commits the selected dispatch date', () => {
    const onViewDateChange = vi.fn();

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([buildDispatchAppointment()])}
        viewDate="2026-05-22"
        onViewDateChange={onViewDateChange}
      />
    );

    fireEvent.click(screen.getByLabelText('Dispatch date'));
    expect(screen.getByRole('dialog', { name: 'Dispatch calendar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'May 23, 2026' }));

    expect(onViewDateChange).toHaveBeenCalledWith('2026-05-23');
    expect(screen.queryByRole('dialog', { name: 'Dispatch calendar' })).not.toBeInTheDocument();
  });

  it('moves the dispatch day with previous and next controls', () => {
    const onViewDateChange = vi.fn();

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([buildDispatchAppointment()])}
        viewDate="2026-05-22"
        onViewDateChange={onViewDateChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous dispatch day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next dispatch day' }));

    expect(onViewDateChange).toHaveBeenNthCalledWith(1, '2026-05-21');
    expect(onViewDateChange).toHaveBeenNthCalledWith(2, '2026-05-22');
  });

  it('jumps back to today from the dispatch toolbar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 23, 9, 0, 0));
    const onViewDateChange = vi.fn();

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([buildDispatchAppointment()])}
        viewDate="2026-05-22"
        onViewDateChange={onViewDateChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(onViewDateChange).toHaveBeenCalledWith('2026-05-23');
    vi.useRealTimers();
  });

  it('calls refresh and reflects refresh state', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const dispatchBoard = buildDispatchBoard([buildDispatchAppointment()]);

    const { rerender } = render(
      <DispatchBoardPanel
        dispatchBoard={dispatchBoard}
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
        dispatchBoard={dispatchBoard}
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

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onOpenJobDetail={onOpenJobDetail}
      />
    );

    fireEvent.click(screen.getByLabelText(/Appointment 1001 for Acme/i));

    expect(onOpenJobDetail).toHaveBeenCalledWith('job-1', 'appt-tech1');
  });

  it('shows review and equipment glance when supplied by the dispatch feed', () => {
    const dispatchBoard = buildDispatchBoard([
      buildDispatchAppointment({
        status: 'finished',
        needsOfficeReview: true,
        equipmentCount: 4,
        equipment: [
          {
            id: 'equipment-1',
            equipmentType: 'Condenser',
            brand: 'Carrier',
            model: 'ABC',
            serialNumber: 'SN-1',
            filterSizes: ['16x20x1'],
            installDate: '2021-05-01',
            status: 'active'
          },
          {
            id: 'equipment-2',
            equipmentType: 'Furnace',
            brand: 'Trane',
            model: 'XYZ',
            serialNumber: 'SN-2',
            filterSizes: [],
            status: 'active'
          }
        ]
      })
    ]);

    render(<DispatchBoardPanel dispatchBoard={dispatchBoard} viewDate="2026-05-22" />);

    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText(/Condenser Carrier ABC, Furnace Trane XYZ \+2/)).toBeInTheDocument();
  });
});
