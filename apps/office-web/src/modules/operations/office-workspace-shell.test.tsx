import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppointmentSummary,
  DispatchBoardResponse,
  JobDetailResponse,
  JobSummary,
  JobsWorkspaceResponse,
  MediaAttachmentSummary,
  RegisterEntrySummary
} from '@/lib/operations-api';
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
  getOfficeDispatchBoard: vi.fn(),
  getOfficeJobDetail: vi.fn(),
  getOfficeJobsWorkspace: vi.fn(),
  getOfficeMediaAttachments: vi.fn(),
  getOfficeMediaBlob: vi.fn(),
  getOfficeRegisterEntries: vi.fn(),
  linkOfficeEquipmentReplacement: vi.fn(),
  updateOfficeAppointmentSchedule: vi.fn(),
  updateOfficeAppointmentStatus: vi.fn(),
  updateOfficeEquipment: vi.fn(),
  updateOfficeJobStatus: vi.fn(),
  updateOfficeMediaAttachment: vi.fn(),
  updateOfficeRegisterEntry: vi.fn(),
  voidOfficeMediaAttachment: vi.fn(),
  voidOfficeRegisterEntry: vi.fn()
}));

vi.mock('@/lib/identity-api', () => ({
  getCurrentOfficeSession: vi.fn()
}));

vi.mock('./crm-panel', () => ({
  CrmPanel: () => <section aria-label="CRM panel mock">CRM panel mock</section>
}));

vi.mock('./equipment-panel', () => ({
  EquipmentPanel: () => <section aria-label="Equipment panel mock">Equipment panel mock</section>
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

const baseTimestamp = '2026-05-22T10:00:00.000Z';

function getTodayDateInputValue(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appointment-1',
    jobId: 'job-1',
    scheduledDate: getTodayDateInputValue(),
    scheduledStartTime: '08:00',
    scheduledEndTime: '10:00',
    technicianId: 'tech-1',
    technicianName: 'Taylor Tech',
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
    timeline: [
      {
        id: 'timeline-1',
        kind: 'statusChanged',
        actorName: 'Office User',
        message: 'Job scheduled.',
        occurredAt: baseTimestamp
      }
    ],
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildRegisterEntry(overrides: Partial<RegisterEntrySummary> = {}): RegisterEntrySummary {
  return {
    id: 'register-1',
    jobId: 'job-1',
    appointmentId: 'appointment-1',
    kind: 'part',
    description: 'Diagnostic capacitor',
    quantity: 1,
    unitOfMeasure: 'each',
    unitPrice: 45,
    totalAmount: 45,
    partNumber: 'CAP-45',
    inventorySourceLabel: 'truck',
    capturedByEmployeeId: 'tech-1',
    capturedByName: 'Taylor Tech',
    capturedAt: baseTimestamp,
    isVoid: false,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildMediaAttachment(overrides: Partial<MediaAttachmentSummary> = {}): MediaAttachmentSummary {
  return {
    id: 'media-1',
    jobId: 'job-1',
    appointmentId: 'appointment-1',
    kind: 'image',
    contentType: 'image/jpeg',
    byteSize: 1024,
    sha256: 'a'.repeat(64),
    originalFilename: 'compressor.jpg',
    caption: 'Before cleaning',
    capturedByEmployeeId: 'tech-1',
    capturedByName: 'Taylor Tech',
    capturedAt: baseTimestamp,
    uploadCompleted: true,
    uploadedAt: baseTimestamp,
    isVoid: false,
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
    technicians: [{ id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' }],
    jobs
  };
}

function buildDispatchBoard(workspace: JobsWorkspaceResponse): DispatchBoardResponse {
  return {
    startDate: getTodayDateInputValue(),
    endDate: getTodayDateInputValue(),
    technicians: workspace.technicians,
    appointments: workspace.jobs.flatMap((job) =>
      job.appointments
        .filter((appointment) => appointment.scheduledDate === getTodayDateInputValue())
        .map((appointment) => ({
          appointmentId: appointment.id,
          jobId: job.id,
          jobNumber: job.jobNumber,
          jobSummary: job.summary,
          jobStatus: job.status,
          jobType: job.jobType,
          workOrderNumber: job.workOrderNumber,
          status: appointment.status,
          scheduledDate: appointment.scheduledDate ?? getTodayDateInputValue(),
          scheduledStartTime: appointment.scheduledStartTime,
          scheduledEndTime: appointment.scheduledEndTime,
          timeWindowLabel: appointment.timeWindowLabel,
          technicianId: appointment.technicianId,
          technicianName: appointment.technicianName,
          locationId: job.locationId,
          locationName: job.locationName,
          locationAddressLine1: '123 Main',
          locationCity: 'Blaine',
          locationState: 'WA',
          billToCustomerId: job.billToCustomerId,
          billToCustomerName: job.billToCustomerName,
          customerName: job.billToCustomerName,
          needsOfficeReview: appointment.needsOfficeReview || job.needsOfficeReview,
          equipment: [],
          equipmentCount: 0
        }))
    )
  };
}

function buildJobDetail(
  job: JobSummary,
  registerEntries: RegisterEntrySummary[] = [],
  mediaAttachments: MediaAttachmentSummary[] = []
): JobDetailResponse {
  return {
    job,
    location: buildWorkspace([job]).locations[0],
    billToCustomer: buildWorkspace([job]).customers[0],
    technicians: buildWorkspace([job]).technicians,
    equipment: [],
    registerEntries,
    mediaAttachments,
    timelineLimit: 50,
    timelineHasMore: false
  };
}

function arrangeWorkspace(workspace: JobsWorkspaceResponse) {
  mockedIdentityApi.getCurrentOfficeSession.mockResolvedValue({ employee });
  mockedOperationsApi.getOfficeJobsWorkspace.mockResolvedValue(workspace);
  mockedOperationsApi.getOfficeDispatchBoard.mockResolvedValue(buildDispatchBoard(workspace));
  mockedOperationsApi.getOfficeJobDetail.mockImplementation(async ({ jobId }) => {
    const job = workspace.jobs.find((candidate) => candidate.id === jobId) ?? workspace.jobs[0] ?? buildJob();
    return buildJobDetail(job);
  });
  mockedOperationsApi.getOfficeEquipmentWorkspace.mockResolvedValue({
    locations: [],
    equipment: [],
    suggestedEquipmentTypes: []
  });
  mockedOperationsApi.getOfficeRegisterEntries.mockResolvedValue({ registerEntries: [] });
  mockedOperationsApi.getOfficeMediaAttachments.mockResolvedValue({ mediaAttachments: [] });
  mockedOperationsApi.getOfficeMediaBlob.mockResolvedValue(new Blob(['media-bytes']));
  mockedOperationsApi.createOfficeJob.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeAppointmentSchedule.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeAppointmentStatus.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeJobStatus.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.addOfficeAppointment.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.acknowledgeOfficeFinishedVisitReview.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeRegisterEntry.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.voidOfficeRegisterEntry.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeMediaAttachment.mockResolvedValue({
    mediaAttachment: buildMediaAttachment()
  });
  mockedOperationsApi.voidOfficeMediaAttachment.mockResolvedValue({
    mediaAttachment: buildMediaAttachment({ isVoid: true })
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OfficeWorkspaceShell IA', () => {
  it('defaults to dispatch and does not render every workspace at once', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    expect(await screen.findByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'CRM panel mock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Equipment panel mock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Jobs queue' })).not.toBeInTheDocument();
  });

  it('switches between Dispatch, Customers, Jobs, and Equipment from the rail', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    expect(await screen.findByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
    expect(await screen.findByRole('region', { name: 'CRM panel mock' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dispatch board' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jobs' }));
    expect(await screen.findByRole('region', { name: 'Jobs queue' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Equipment' }));
    expect(await screen.findByRole('region', { name: 'Equipment panel mock' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dispatch' }));
    expect(await screen.findByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();
  });

  it('opens job detail from a dispatch appointment card focused on that appointment', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));

    expect(await screen.findByRole('region', { name: 'Job 1001 detail' })).toBeInTheDocument();
    expect(mockedOperationsApi.getOfficeJobDetail).toHaveBeenCalledWith({
      jobId: 'job-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    expect(screen.getByLabelText('Appointment end time')).toHaveValue('10:00');
  });

  it('opens job detail from the jobs queue', async () => {
    arrangeWorkspace(
      buildWorkspace([
        buildJob({
          id: 'job-queue',
          jobNumber: '1002',
          summary: 'Needs scheduling',
          status: 'new',
          needsScheduling: true,
          appointments: []
        })
      ])
    );

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Jobs' }));
    fireEvent.click(await screen.findByRole('button', { name: /Job 1002/i }));

    expect(await screen.findByRole('region', { name: 'Job 1002 detail' })).toBeInTheDocument();
  });

  it('creates jobs from the focused new-job form using the existing API helper', async () => {
    const today = getTodayDateInputValue();
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    expect(await screen.findByRole('region', { name: 'New job' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Job summary'), { target: { value: 'No heat' } });
    fireEvent.change(screen.getByLabelText('Job date'), { target: { value: today } });
    fireEvent.change(screen.getByLabelText('Job start'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Job end'), { target: { value: '11:00' } });
    fireEvent.change(screen.getByLabelText('Tech'), { target: { value: 'tech-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }));

    await waitFor(() => {
      expect(mockedOperationsApi.createOfficeJob).toHaveBeenCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        locationId: 'location-1',
        billToCustomerId: 'customer-1',
        jobType: 'Service',
        category: 'General',
        origin: 'Inbound phone call',
        summary: 'No heat',
        scheduledDate: today,
        scheduledStartTime: '09:00',
        scheduledEndTime: '11:00',
        timeWindowLabel: undefined,
        technicianId: 'tech-1'
      });
    });
    expect(await screen.findByText('Job created.')).toBeInTheDocument();
  });

  it('saves appointment schedule and status changes from job detail through existing API helpers', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));
    const appointment = await screen.findByRole('region', { name: 'Appointment appointment-1' });
    fireEvent.change(within(appointment).getByLabelText('Appointment end time'), {
      target: { value: '11:00' }
    });
    fireEvent.change(within(appointment).getByLabelText('Status'), {
      target: { value: 'confirmed' }
    });
    fireEvent.click(within(appointment).getByRole('button', { name: 'Save appointment' }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentStatus).toHaveBeenCalledWith({
        appointmentId: 'appointment-1',
        status: 'confirmed',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test'
      });
    });
    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith({
        appointmentId: 'appointment-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        scheduledDate: getTodayDateInputValue(),
        scheduledStartTime: '08:00',
        scheduledEndTime: '11:00',
        timeWindowLabel: undefined,
        technicianId: 'tech-1'
      });
    });
  });

  it('runs finished-visit review actions from job detail', async () => {
    arrangeWorkspace(
      buildWorkspace([
        buildJob({
          status: 'inProgress',
          needsOfficeReview: true,
          appointments: [
            buildAppointment({
              status: 'finished',
              needsOfficeReview: true
            })
          ]
        })
      ])
    );

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeJobStatus).toHaveBeenCalledWith({
        jobId: 'job-1',
        status: 'completed',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test'
      });
    });
  });

  it('loads captured work from job detail and routes register/media actions through office API helpers', async () => {
    const job = buildJob();
    const registerEntry = buildRegisterEntry();
    const mediaAttachment = buildMediaAttachment();
    arrangeWorkspace(buildWorkspace([job]));
    mockedOperationsApi.getOfficeJobDetail.mockResolvedValue(buildJobDetail(job, [registerEntry], [mediaAttachment]));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:media-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Appointment 1001 for Acme/i));
    fireEvent.click(await screen.findByRole('button', { name: 'Captured' }));

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeJobDetail).toHaveBeenCalledWith({
        jobId: 'job-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test'
      });
    });
    fireEvent.change(await screen.findByLabelText('Register quantity for Diagnostic capacitor'), {
      target: { value: '2' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeRegisterEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          registerEntryId: 'register-1',
          quantity: 2,
          sessionToken: 'session-token',
          apiBaseUrl: 'http://api.test'
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    fireEvent.change(await screen.findByLabelText('Media caption for compressor.jpg'), {
      target: { value: 'After cleaning' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Void reason for compressor.jpg'), {
      target: { value: 'wrong file' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeMediaAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', caption: 'After cleaning' })
      );
    });
    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeMediaBlob).toHaveBeenCalledWith({
        mediaId: 'media-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test'
      });
    });
    await waitFor(() => {
      expect(mockedOperationsApi.voidOfficeMediaAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', reason: 'wrong file' })
      );
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('blob:media-1', '_blank', 'noopener,noreferrer');
  });

  it('auto-refreshes while the office workspace stays open', async () => {
    let nextIntervalId = 1;
    const intervalHandlers = new Map<number, () => void>();
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        const intervalId = nextIntervalId;
        intervalHandlers.set(intervalId, () => handler());
        nextIntervalId += 1;

        return intervalId;
      }

      return nextIntervalId++;
    }) as typeof window.setInterval);
    vi.spyOn(window, 'clearInterval').mockImplementation(((intervalId?: number) => {
      if (typeof intervalId === 'number') {
        intervalHandlers.delete(intervalId);
      }
    }) as typeof window.clearInterval);

    const initialWorkspace = buildWorkspace([buildJob()]);
    const refreshedWorkspace = buildWorkspace([
      buildJob({
        appointments: [
          buildAppointment({
            status: 'cancelled'
          })
        ]
      })
    ]);
    arrangeWorkspace(initialWorkspace);
    mockedOperationsApi.getOfficeDispatchBoard
      .mockResolvedValueOnce(buildDispatchBoard(initialWorkspace))
      .mockResolvedValueOnce(buildDispatchBoard(refreshedWorkspace))
      .mockResolvedValue(buildDispatchBoard(refreshedWorkspace));

    renderShell();

    expect(await screen.findByLabelText(/Appointment 1001 for Acme/i)).toBeInTheDocument();
    expect(intervalHandlers.size).toBe(1);

    await act(async () => {
      [...intervalHandlers.values()][0]?.();
    });

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeDispatchBoard).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/Appointment 1001 for Acme/i)).not.toBeInTheDocument();
    });
  });
});
