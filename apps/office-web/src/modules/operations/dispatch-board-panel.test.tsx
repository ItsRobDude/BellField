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

function stubElementFromPoint(element: Element | null): () => void {
  const originalElementFromPoint = document.elementFromPoint;

  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element)
  });

  return () => {
    if (originalElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint
      });
      return;
    }

    Reflect.deleteProperty(document, 'elementFromPoint');
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
    const taylorLane = taylorRegion.children[1]?.children[0];

    expect(within(unassignedRegion).getByText('#1002')).toBeInTheDocument();
    expect(within(taylorRegion).getByText('#1001')).toBeInTheDocument();
    expect(within(taylorRegion).getByText('Main Shop')).toBeInTheDocument();
    expect(within(taylorRegion).getByText('123 Main, Blaine, WA')).toBeInTheDocument();
    expect(taylorRegion).toHaveStyle({ minHeight: '4.85rem' });
    expect(taylorRegion.children[0]).toHaveStyle({ minHeight: '4.85rem' });
    expect(taylorLane).toHaveStyle({ minHeight: '4.85rem' });
    expect(
      within(taylorRegion).getByRole('button', {
        name: 'Job 1001, Main Shop, 123 Main, Blaine, WA, Scheduled'
      })
    ).toHaveStyle({ height: '100%', minHeight: '3.8rem', minWidth: '11rem' });
    expect(within(taylorRegion).queryByText('1')).not.toBeInTheDocument();
    expect(within(taylorRegion).queryByText('No cooling')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByLabelText(/Job 1001, Main Shop/i));

    expect(onOpenJobDetail).toHaveBeenCalledWith('job-1', 'appt-tech1');
  });

  it('opens dispatch card actions from right-click and keyboard context menu triggers', () => {
    const onOpenJobDetail = vi.fn();
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);
    const onAppointmentStatusUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onOpenJobDetail={onOpenJobDetail}
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
        onAppointmentStatusUpdate={onAppointmentStatusUpdate}
      />
    );

    const cardButton = screen.getByLabelText(/Job 1001, Main Shop/i);
    fireEvent.contextMenu(cardButton, { clientX: 120, clientY: 140 });

    let menu = screen.getByRole('menu', { name: 'Dispatch actions for job 1001' });
    expect(within(menu).getByRole('menuitem', { name: 'Open overview' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Open appointments' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Edit schedule' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Assign / reassign' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Copy address' })).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Scheduled is the current status' })
    ).toBeDisabled();

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open appointments' }));
    expect(onOpenJobDetail).toHaveBeenCalledWith('job-1', 'appt-tech1', 'appointments');
    expect(
      screen.queryByRole('menu', { name: 'Dispatch actions for job 1001' })
    ).not.toBeInTheDocument();

    fireEvent.keyDown(cardButton, { key: 'F10', shiftKey: true });
    menu = screen.getByRole('menu', { name: 'Dispatch actions for job 1001' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Change status to Dispatched' }));

    expect(onAppointmentStatusUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', 'dispatched');
    expect(
      screen.queryByRole('menu', { name: 'Dispatch actions for job 1001' })
    ).not.toBeInTheDocument();
  });

  it('opens schedule editing from dispatch card actions and closes the menu on escape', () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const cardButton = screen.getByLabelText(/Job 1001, Main Shop/i);
    fireEvent.contextMenu(cardButton, { clientX: 120, clientY: 140 });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('menu', { name: 'Dispatch actions for job 1001' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(cardButton, { clientX: 120, clientY: 140 });
    expect(screen.getByRole('menu', { name: 'Dispatch actions for job 1001' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole('menu', { name: 'Dispatch actions for job 1001' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(cardButton, { clientX: 120, clientY: 140 });
    const menu = screen.getByRole('menu', { name: 'Dispatch actions for job 1001' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit schedule' }));

    expect(screen.getByRole('dialog', { name: 'Edit schedule for job 1001' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menu', { name: 'Dispatch actions for job 1001' })
    ).not.toBeInTheDocument();
  });

  it('edits appointment scheduling from a compact dispatch popover', async () => {
    const onOpenJobDetail = vi.fn();
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onOpenJobDetail={onOpenJobDetail}
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit schedule for job 1001' }));

    expect(onOpenJobDetail).not.toHaveBeenCalled();

    const scheduleDialog = screen.getByRole('dialog', { name: 'Edit schedule for job 1001' });
    expect(within(scheduleDialog).getByLabelText('Dispatch appointment date')).toHaveValue(
      '2026-05-22'
    );
    expect(within(scheduleDialog).getByLabelText('Dispatch appointment start time')).toHaveValue(
      '08:00'
    );
    expect(within(scheduleDialog).getByLabelText('Dispatch appointment end time')).toHaveValue(
      '10:00'
    );

    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment date'), {
      target: { value: '2026-05-23' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment start time'), {
      target: { value: '09:15' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment end time'), {
      target: { value: '12:30' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment time window'), {
      target: { value: '9:15 AM - 12:30 PM' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment technician'), {
      target: { value: 'tech-2' }
    });
    fireEvent.click(within(scheduleDialog).getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => {
      expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
        scheduledDate: '2026-05-23',
        scheduledStartTime: '09:15',
        scheduledEndTime: '12:30',
        timeWindowLabel: '9:15 AM - 12:30 PM',
        technicianId: 'tech-2'
      });
    });
    expect(
      screen.queryByRole('dialog', { name: 'Edit schedule for job 1001' })
    ).not.toBeInTheDocument();
  });

  it('resizes a timed dispatch card duration from the right edge', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const resizeHandle = screen.getByRole('button', { name: 'Resize job 1001 duration' });
    fireEvent.pointerDown(resizeHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 220 });

    expect(screen.getByText('8:00 AM - 11:15 AM')).toBeInTheDocument();

    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
        scheduledDate: '2026-05-22',
        scheduledStartTime: '08:00',
        scheduledEndTime: '11:15',
        timeWindowLabel: '8:00 AM - 11:15 AM',
        technicianId: 'tech-1'
      });
    });
  });

  it('moves a timed dispatch card horizontally while preserving duration', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);
    const onOpenJobDetail = vi.fn();

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
        onOpenJobDetail={onOpenJobDetail}
      />
    );

    const cardButton = screen.getByRole('button', { name: /Job 1001/ });
    fireEvent.pointerDown(cardButton, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 196 });

    expect(screen.getByText('9:00 AM - 11:00 AM')).toBeInTheDocument();

    fireEvent.pointerUp(window);
    fireEvent.click(cardButton);

    await waitFor(() => {
      expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
        scheduledDate: '2026-05-22',
        scheduledStartTime: '09:00',
        scheduledEndTime: '11:00',
        timeWindowLabel: '9:00 AM - 11:00 AM',
        technicianId: 'tech-1'
      });
    });
    expect(onOpenJobDetail).not.toHaveBeenCalled();
  });

  it('marks overlapping timed cards in technician rows without blocking the board', () => {
    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' }),
          buildDispatchAppointment({
            appointmentId: 'appt-tech2',
            jobId: 'job-2',
            jobNumber: '1002',
            scheduledStartTime: '09:30',
            scheduledEndTime: '11:00'
          })
        ])}
        viewDate="2026-05-22"
      />
    );

    const taylorRegion = screen.getByRole('region', { name: /Appointments for Taylor Tech/i });

    expect(within(taylorRegion).getAllByText('Overlap')).toHaveLength(2);
    expect(
      within(taylorRegion).getByRole('button', {
        name: /Job 1001.*overlaps another appointment/i
      })
    ).toBeInTheDocument();
    expect(
      within(taylorRegion).getByRole('button', {
        name: /Job 1002.*overlaps another appointment/i
      })
    ).toBeInTheDocument();
  });

  it('warns but still saves when a timed card is moved into an overlap', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' }),
          buildDispatchAppointment({
            appointmentId: 'appt-blocker',
            jobId: 'job-2',
            jobNumber: '1002',
            scheduledStartTime: '10:30',
            scheduledEndTime: '12:00'
          })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const cardButton = screen.getByRole('button', { name: /Job 1001/ });
    fireEvent.pointerDown(cardButton, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 196 });

    expect(
      screen.getByText('9:00 AM - 11:00 AM: Overlaps another appointment')
    ).toBeInTheDocument();

    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
        scheduledDate: '2026-05-22',
        scheduledStartTime: '09:00',
        scheduledEndTime: '11:00',
        timeWindowLabel: '9:00 AM - 11:00 AM',
        technicianId: 'tech-1'
      });
    });
  });

  it('warns but still saves when a card duration is resized into an overlap', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({
            appointmentId: 'appt-tech1',
            scheduledEndTime: '09:00'
          }),
          buildDispatchAppointment({
            appointmentId: 'appt-blocker',
            jobId: 'job-2',
            jobNumber: '1002',
            scheduledStartTime: '09:30',
            scheduledEndTime: '11:00'
          })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const resizeHandle = screen.getByRole('button', { name: 'Resize job 1001 duration' });
    fireEvent.pointerDown(resizeHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 196 });

    expect(
      screen.getByText('8:00 AM - 10:00 AM: Overlaps another appointment')
    ).toBeInTheDocument();

    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
        scheduledDate: '2026-05-22',
        scheduledStartTime: '08:00',
        scheduledEndTime: '10:00',
        timeWindowLabel: '8:00 AM - 10:00 AM',
        technicianId: 'tech-1'
      });
    });
  });

  it('keeps normal card open behavior when pointer movement does not become a drag', () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);
    const onOpenJobDetail = vi.fn();

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
        onOpenJobDetail={onOpenJobDetail}
      />
    );

    const cardButton = screen.getByRole('button', { name: /Job 1001/ });
    fireEvent.pointerDown(cardButton, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(window);
    fireEvent.click(cardButton);

    expect(onAppointmentScheduleUpdate).not.toHaveBeenCalled();
    expect(onOpenJobDetail).toHaveBeenCalledWith('job-1', 'appt-tech1');
  });

  it('reassigns a timed dispatch card to another technician row', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const samRow = screen.getByRole('region', { name: 'Appointments for Sam Tech' });
    const restoreElementFromPoint = stubElementFromPoint(samRow);

    try {
      const cardButton = screen.getByRole('button', { name: /Job 1001/ });
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 102, clientY: 130 });

      expect(screen.getByText('Assign to Sam Tech')).toBeInTheDocument();

      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
          scheduledDate: '2026-05-22',
          scheduledStartTime: '08:00',
          scheduledEndTime: '10:00',
          timeWindowLabel: '',
          technicianId: 'tech-2'
        });
      });
    } finally {
      restoreElementFromPoint();
    }
  });

  it('warns but still saves when reassignment would overlap the target row', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' }),
          buildDispatchAppointment({
            appointmentId: 'appt-sam',
            jobId: 'job-2',
            jobNumber: '1002',
            technicianId: 'tech-2',
            technicianName: 'Sam Tech',
            scheduledStartTime: '09:00',
            scheduledEndTime: '11:00'
          })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const samRow = screen.getByRole('region', { name: 'Appointments for Sam Tech' });
    const restoreElementFromPoint = stubElementFromPoint(samRow);

    try {
      const cardButton = screen.getByRole('button', { name: /Job 1001/ });
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 102, clientY: 130 });

      expect(
        screen.getByText('Assign to Sam Tech: Overlaps another appointment')
      ).toBeInTheDocument();

      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
          scheduledDate: '2026-05-22',
          scheduledStartTime: '08:00',
          scheduledEndTime: '10:00',
          timeWindowLabel: '',
          technicianId: 'tech-2'
        });
      });
    } finally {
      restoreElementFromPoint();
    }
  });

  it('reassigns an assigned card to the unassigned row', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1', timeWindowLabel: 'First call' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const unassignedRow = screen.getByRole('region', { name: 'Unassigned appointments' });
    const restoreElementFromPoint = stubElementFromPoint(unassignedRow);

    try {
      const cardButton = screen.getByRole('button', { name: /Job 1001/ });
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 132 });

      expect(screen.getByText('Move to Unassigned')).toBeInTheDocument();

      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
          scheduledDate: '2026-05-22',
          scheduledStartTime: '08:00',
          scheduledEndTime: '10:00',
          timeWindowLabel: 'First call',
          technicianId: ''
        });
      });
    } finally {
      restoreElementFromPoint();
    }
  });

  it('reassigns an untimed unassigned card to a technician row', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({
            appointmentId: 'appt-unassigned',
            scheduledStartTime: undefined,
            scheduledEndTime: undefined,
            technicianId: undefined,
            technicianName: undefined
          })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const samRow = screen.getByRole('region', { name: 'Appointments for Sam Tech' });
    const restoreElementFromPoint = stubElementFromPoint(samRow);

    try {
      const cardButton = screen.getByRole('button', { name: /Job 1001/ });
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 98, clientY: 136 });
      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-unassigned', {
          scheduledDate: '2026-05-22',
          scheduledStartTime: '',
          scheduledEndTime: '',
          timeWindowLabel: '',
          technicianId: 'tech-2'
        });
      });
    } finally {
      restoreElementFromPoint();
    }
  });

  it('does not save reassignment when dropped on the same row or no row', () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const taylorRow = screen.getByRole('region', { name: 'Appointments for Taylor Tech' });
    const restoreElementFromPoint = stubElementFromPoint(taylorRow);

    try {
      const cardButton = screen.getByRole('button', { name: /Job 1001/ });
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 136 });
      fireEvent.pointerUp(window);

      expect(onAppointmentScheduleUpdate).not.toHaveBeenCalled();
    } finally {
      restoreElementFromPoint();
    }

    const restoreNoTargetElementFromPoint = stubElementFromPoint(null);

    try {
      const cardButton = screen.getByRole('button', { name: /Job 1001/ });
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 2 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 136 });
      fireEvent.pointerUp(window);

      expect(onAppointmentScheduleUpdate).not.toHaveBeenCalled();
    } finally {
      restoreNoTargetElementFromPoint();
    }
  });

  it('does not save a resize when the expected end time did not change', () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({ appointmentId: 'appt-tech1' })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const resizeHandle = screen.getByRole('button', { name: 'Resize job 1001 duration' });
    fireEvent.pointerDown(resizeHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(window);

    expect(onAppointmentScheduleUpdate).not.toHaveBeenCalled();
  });

  it('resizes a card with a structured start and no expected end time', async () => {
    const onAppointmentScheduleUpdate = vi.fn(async () => undefined);

    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({
            appointmentId: 'appt-tech1',
            scheduledEndTime: undefined
          })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={onAppointmentScheduleUpdate}
      />
    );

    const resizeHandle = screen.getByRole('button', { name: 'Resize job 1001 duration' });
    fireEvent.pointerDown(resizeHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 148 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(onAppointmentScheduleUpdate).toHaveBeenCalledWith('job-1', 'appt-tech1', {
        scheduledDate: '2026-05-22',
        scheduledStartTime: '08:00',
        scheduledEndTime: '10:00',
        timeWindowLabel: '8:00 AM - 10:00 AM',
        technicianId: 'tech-1'
      });
    });
  });

  it('does not show resize controls for untimed dispatch cards', () => {
    render(
      <DispatchBoardPanel
        dispatchBoard={buildDispatchBoard([
          buildDispatchAppointment({
            appointmentId: 'appt-tech1',
            scheduledStartTime: undefined,
            scheduledEndTime: undefined
          })
        ])}
        viewDate="2026-05-22"
        onAppointmentScheduleUpdate={async () => undefined}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Resize job 1001 duration' })
    ).not.toBeInTheDocument();
  });

  it('shows review status without crowding cards with equipment details', () => {
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
    expect(screen.queryByText(/Condenser Carrier ABC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Furnace Trane XYZ/)).not.toBeInTheDocument();
  });
});
