import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentSummary, JobSummary, JobsWorkspaceResponse } from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import type { EmployeeSummary } from '@/lib/identity-api';
import * as identityApi from '@/lib/identity-api';
import { OfficeWorkspaceShell } from './office-workspace-shell';

vi.mock('@/lib/operations-api', () => ({
  acknowledgeOfficeFinishedVisitReview: vi.fn(),
  addOfficeAppointment: vi.fn(),
  createOfficeEquipment: vi.fn(),
  createOfficeJob: vi.fn(),
  deleteOfficeEquipment: vi.fn(),
  getOfficeEquipmentDetail: vi.fn(),
  getOfficeEquipmentWorkspace: vi.fn(),
  getOfficeJobsWorkspace: vi.fn(),
  linkOfficeEquipmentReplacement: vi.fn(),
  updateOfficeAppointmentSchedule: vi.fn(),
  updateOfficeAppointmentStatus: vi.fn(),
  updateOfficeEquipment: vi.fn(),
  updateOfficeJobStatus: vi.fn()
}));

vi.mock('@/lib/identity-api', () => ({
  getCurrentOfficeSession: vi.fn(),
  getOfficeEmployees: vi.fn(),
  getOfficeRoles: vi.fn(),
  updateOfficeEmployee: vi.fn()
}));

vi.mock('./crm-panel', () => ({
  CrmPanel: () => <section aria-label="CRM panel mock">CRM panel mock</section>
}));

vi.mock('./equipment-panel', () => ({
  EquipmentPanel: () => <section aria-label="Equipment panel mock">Equipment panel mock</section>
}));

vi.mock('./employee-management-panel', () => ({
  EmployeeManagementPanel: () => <section aria-label="Employee panel mock">Employee panel mock</section>
}));

const mockedOperationsApi = vi.mocked(operationsApi);
const mockedIdentityApi = vi.mocked(identityApi);

const employee: EmployeeSummary = {
  id: 'employee-1',
  email: 'office@example.com',
  displayName: 'Office User',
  roleId: 'dispatcher',
  roleName: 'Dispatcher',
  isActive: true,
  effectivePermissions: [],
  permissionOverrides: {
    grantedPermissions: [],
    revokedPermissions: []
  }
};

function getTodayDateInputValue(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function getDateInputValueOffset(dayOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return getTodayDateInputValue(date);
}

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appointment-1',
    jobId: 'job-1',
    status: 'scheduled',
    needsOfficeReview: false,
    createdAt: '2026-05-22T10:00:00.000Z',
    updatedAt: '2026-05-22T10:00:00.000Z',
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
    createdAt: '2026-05-22T10:00:00.000Z',
    updatedAt: '2026-05-22T10:00:00.000Z',
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
    technicians: [{ id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' }],
    jobs
  };
}

function arrangeWorkspace(workspace: JobsWorkspaceResponse) {
  mockedIdentityApi.getCurrentOfficeSession.mockResolvedValue({ employee });
  mockedIdentityApi.getOfficeRoles.mockResolvedValue({ roles: [] });
  mockedIdentityApi.getOfficeEmployees.mockResolvedValue({ employees: [] });
  mockedOperationsApi.getOfficeJobsWorkspace.mockResolvedValue(workspace);
  mockedOperationsApi.getOfficeEquipmentWorkspace.mockResolvedValue({
    locations: [],
    equipment: [],
    suggestedEquipmentTypes: []
  });
}

function renderShell() {
  render(
    <OfficeWorkspaceShell
      apiBaseUrl="http://api.test"
      initialEmployee={employee}
      sessionToken="session-token"
      onSignOut={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window.HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  vi.restoreAllMocks();
});

describe('OfficeWorkspaceShell dispatch integration', () => {
  it('renders the dispatch board between equipment and jobs in the real shell composition', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    const equipmentPanel = await screen.findByRole('region', { name: 'Equipment panel mock' });
    const dispatchBoard = await screen.findByRole('region', { name: /Dispatch board v1 foundation/i });
    const jobsHeading = await screen.findByRole('heading', { name: 'Jobs and appointments' });

    expect(equipmentPanel.compareDocumentPosition(dispatchBoard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dispatchBoard.compareDocumentPosition(jobsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens a dispatch card in the jobs panel by focusing the matching job card', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });
    arrangeWorkspace(
      buildWorkspace([
        buildJob({
          appointments: [
            buildAppointment({
              scheduledDate: getTodayDateInputValue(),
              technicianId: 'tech-1',
              technicianName: 'Taylor Tech'
            })
          ]
        })
      ])
    );

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));
    fireEvent.click(await screen.findByRole('button', { name: /Open job 1001 in the jobs panel/i }));

    await waitFor(() => {
      const focusedJob = screen.getByText(/Job 1001: No cooling/i).closest('article');
      expect(focusedJob).toHaveAttribute('aria-current', 'true');
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  it('saves dispatch drawer changes through the appointment schedule API and normalizes unassigned technicians', async () => {
    const today = getTodayDateInputValue();
    const initialWorkspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            scheduledDate: today,
            timeWindowLabel: '8-10',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech'
          })
        ]
      })
    ]);
    const updatedWorkspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            scheduledDate: today,
            timeWindowLabel: '8-10'
          })
        ]
      })
    ]);
    arrangeWorkspace(initialWorkspace);
    mockedOperationsApi.getOfficeJobsWorkspace
      .mockResolvedValueOnce(initialWorkspace)
      .mockResolvedValueOnce(updatedWorkspace)
      .mockResolvedValue(updatedWorkspace);
    mockedOperationsApi.updateOfficeAppointmentSchedule.mockResolvedValue(updatedWorkspace.jobs[0]!);

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));

    const drawer = await screen.findByRole('complementary', { name: /Appointment detail drawer/i });
    fireEvent.change(within(drawer).getByLabelText('Dispatch technician'), {
      target: { value: '' }
    });
    fireEvent.click(within(drawer).getByRole('button', { name: /Save dispatch changes/i }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith({
        appointmentId: 'appointment-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        scheduledDate: today,
        timeWindowLabel: '8-10',
        technicianId: undefined
      });
    });
    expect(await screen.findByText('Dispatch schedule updated.')).toBeInTheDocument();
  });

  it('removes appointments from the current dispatch board after they are moved to another date', async () => {
    const today = getTodayDateInputValue();
    const tomorrow = getDateInputValueOffset(1);
    const initialWorkspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            scheduledDate: today,
            timeWindowLabel: '8-10',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech'
          })
        ]
      })
    ]);
    const updatedWorkspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            scheduledDate: tomorrow,
            timeWindowLabel: '8-10',
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech'
          })
        ]
      })
    ]);
    arrangeWorkspace(initialWorkspace);
    mockedOperationsApi.getOfficeJobsWorkspace
      .mockResolvedValueOnce(initialWorkspace)
      .mockResolvedValueOnce(updatedWorkspace)
      .mockResolvedValue(updatedWorkspace);
    mockedOperationsApi.updateOfficeAppointmentSchedule.mockResolvedValue(updatedWorkspace.jobs[0]!);

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));

    const drawer = await screen.findByRole('complementary', { name: /Appointment detail drawer/i });
    fireEvent.change(within(drawer).getByLabelText('Dispatch appointment date'), {
      target: { value: tomorrow }
    });
    fireEvent.click(within(drawer).getByRole('button', { name: /Save dispatch changes/i }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appointment-1',
          scheduledDate: tomorrow
        })
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/Appointment 1001 for Acme/i)).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText(
        `Appointment moved to ${tomorrow}. It is no longer shown on the ${today} dispatch board.`
      )
    ).toBeInTheDocument();
  });

  it('resets a cleared dispatch date to today without showing unscheduled appointments', async () => {
    const today = getTodayDateInputValue();
    arrangeWorkspace(
      buildWorkspace([
        buildJob({
          appointments: [
            buildAppointment({
              scheduledDate: today,
              technicianId: 'tech-1',
              technicianName: 'Taylor Tech'
            })
          ]
        }),
        buildJob({
          id: 'job-2',
          jobNumber: '1002',
          summary: 'Heat not working',
          needsScheduling: true,
          appointments: [
            buildAppointment({
              id: 'appointment-2',
              jobId: 'job-2',
              technicianId: 'tech-1',
              technicianName: 'Taylor Tech'
            })
          ]
        })
      ])
    );

    renderShell();

    expect(await screen.findByLabelText(/Appointment 1001 for Acme/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Dispatch date'), {
      target: { value: '' }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Dispatch date')).toHaveValue(today);
    });
    expect(screen.queryByLabelText(/Appointment 1002 for Acme/i)).not.toBeInTheDocument();
  });
});
