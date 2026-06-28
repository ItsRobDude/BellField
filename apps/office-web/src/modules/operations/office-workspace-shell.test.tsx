import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppointmentSummary,
  CrmOperationalContext,
  CrmSearchResult,
  CustomerDetail,
  DispatchBoardResponse,
  JobDetailResponse,
  JobIntakeContextResponse,
  JobSummary,
  JobsQueueResponse,
  JobsWorkspaceResponse,
  LocationDetail,
  MediaAttachmentSummary,
  RegisterEntrySummary
} from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import { OfficeIdentityApiError, type EmployeeSummary } from '@/lib/identity-api';
import * as identityApi from '@/lib/identity-api';
import { OfficeWorkspaceShell } from './office-workspace-shell';
import type { CrmNavigationTarget } from './crm-panel-types';

vi.mock('@/lib/operations-api', () => ({
  acknowledgeOfficeFinishedVisitReview: vi.fn(),
  addOfficeAppointment: vi.fn(),
  createOfficeCustomer: vi.fn(),
  createOfficeEquipment: vi.fn(),
  createOfficeJob: vi.fn(),
  createOfficeLocation: vi.fn(),
  deleteOfficeEquipment: vi.fn(),
  getOfficeEquipmentDetail: vi.fn(),
  getOfficeEquipmentWorkspace: vi.fn(),
  getOfficeDispatchBoard: vi.fn(),
  getOfficeCustomerDetail: vi.fn(),
  getOfficeEstimateOutboundMessages: vi.fn(),
  getOfficeJobDetail: vi.fn(),
  getOfficeJobIntakeContext: vi.fn(),
  getOfficeJobsQueue: vi.fn(),
  getOfficeJobsWorkspace: vi.fn(),
  getOfficeLocationDetail: vi.fn(),
  getOfficeMediaAttachments: vi.fn(),
  getOfficeMediaBlob: vi.fn(),
  getOfficeRegisterEntries: vi.fn(),
  getOfficeServiceAgreementReferenceData: vi.fn(),
  activateOfficeServiceAgreement: vi.fn(),
  createOfficeServiceAgreement: vi.fn(),
  endOfficeServiceAgreement: vi.fn(),
  listOfficeServiceAgreements: vi.fn(),
  pauseOfficeServiceAgreement: vi.fn(),
  updateOfficeServiceAgreement: vi.fn(),
  linkOfficeEquipmentReplacement: vi.fn(),
  searchOfficeCrm: vi.fn(),
  sendOfficeEstimate: vi.fn(),
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
  getCurrentOfficeSession: vi.fn(),
  OfficeIdentityApiError: class OfficeIdentityApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code?: string
    ) {
      super(message);
      this.name = 'OfficeIdentityApiError';
    }
  },
  isOfficeSessionExpiredError: (error: unknown) =>
    error instanceof Error &&
    'status' in error &&
    (error as { status?: number }).status === 401 &&
    'code' in error &&
    (error as { code?: string }).code === 'sessionExpired'
}));

type MockCrmPanelProps = {
  navigationTarget?: CrmNavigationTarget | null;
  onBackToJob?: (jobId: string) => void;
};

vi.mock('./crm-panel', () => ({
  CrmPanel: ({ navigationTarget, onBackToJob }: MockCrmPanelProps) => (
    <section aria-label="CRM panel mock">
      CRM panel mock
      {navigationTarget ? (
        <p>
          CRM target: {navigationTarget.kind}{' '}
          {navigationTarget.kind === 'customer'
            ? navigationTarget.customerId
            : navigationTarget.locationId}
        </p>
      ) : null}
      {navigationTarget?.returnToJobId ? (
        <button type="button" onClick={() => onBackToJob?.(navigationTarget.returnToJobId ?? '')}>
          Back to source job
        </button>
      ) : null}
    </section>
  )
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
    billingProjectionState: 'billable',
    costingStatus: 'notCosted',
    capturedByEmployeeId: 'tech-1',
    capturedByName: 'Taylor Tech',
    capturedAt: baseTimestamp,
    isVoid: false,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildMediaAttachment(
  overrides: Partial<MediaAttachmentSummary> = {}
): MediaAttachmentSummary {
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

function emptyOperationalContext(): CrmOperationalContext {
  return {
    agreementContextVisible: false,
    summary: {
      openJobCount: 0,
      equipmentCount: 0,
      appointmentCount: 0,
      invoiceCount: 0,
      estimateCount: 0,
      activeAgreementCount: 0,
      endedAgreementCount: 0
    },
    jobs: [],
    appointments: [],
    invoices: [],
    estimates: [],
    equipment: [],
    agreements: [],
    activity: []
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

function buildLocationDetail(
  workspace: JobsWorkspaceResponse,
  locationId = 'location-1',
  overrides: Partial<LocationDetail> = {}
): LocationDetail {
  const location = workspace.locations.find((candidate) => candidate.id === locationId);
  const resolvedLocation = location ?? workspace.locations[0];

  if (!resolvedLocation) {
    throw new Error('Test workspace needs at least one location.');
  }

  return {
    ...resolvedLocation,
    contactMethods: [],
    ownershipHistory: [],
    operational: emptyOperationalContext(),
    ...overrides
  };
}

function buildCustomerDetail(
  workspace: JobsWorkspaceResponse,
  customerId = 'customer-1',
  overrides: Partial<CustomerDetail> = {}
): CustomerDetail {
  const customer = workspace.customers.find((candidate) => candidate.id === customerId);
  const resolvedCustomer = customer ?? workspace.customers[0];

  if (!resolvedCustomer) {
    throw new Error('Test workspace needs at least one customer.');
  }

  return {
    ...resolvedCustomer,
    contactMethods: [],
    contacts: [],
    locations: workspace.locations
      .filter((location) => location.customerId === resolvedCustomer.id)
      .map((location) => ({
        id: location.id,
        name: location.name,
        addressLine1: location.addressLine1,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        isActive: location.isActive
      })),
    operational: emptyOperationalContext(),
    ...overrides
  };
}

function buildLocationSearchResult(
  workspace: JobsWorkspaceResponse,
  locationId = 'location-1'
): CrmSearchResult {
  const location = workspace.locations.find((candidate) => candidate.id === locationId);
  const resolvedLocation = location ?? workspace.locations[0];

  if (!resolvedLocation) {
    throw new Error('Test workspace needs at least one location.');
  }

  return {
    id: resolvedLocation.id,
    kind: 'location',
    title: resolvedLocation.name,
    subtitle: `${resolvedLocation.addressLine1}, ${resolvedLocation.city}, ${resolvedLocation.state} ${resolvedLocation.postalCode}`,
    badges: [],
    addressLine1: resolvedLocation.addressLine1,
    city: resolvedLocation.city,
    state: resolvedLocation.state,
    postalCode: resolvedLocation.postalCode,
    customerId: resolvedLocation.customerId,
    customerName: resolvedLocation.customerName,
    isActive: resolvedLocation.isActive
  };
}

function buildCustomerSearchResult(
  workspace: JobsWorkspaceResponse,
  customerId = 'customer-1'
): CrmSearchResult {
  const customer = workspace.customers.find((candidate) => candidate.id === customerId);
  const resolvedCustomer = customer ?? workspace.customers[0];

  if (!resolvedCustomer) {
    throw new Error('Test workspace needs at least one customer.');
  }

  return {
    id: resolvedCustomer.id,
    kind: 'customer',
    title: resolvedCustomer.name,
    subtitle: resolvedCustomer.billingAddressLine1,
    badges: [],
    isActive: resolvedCustomer.isActive
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

function buildJobsQueue(workspace: JobsWorkspaceResponse): JobsQueueResponse {
  const queues: JobsQueueResponse['queues'] = [
    { key: 'review', totalCount: 0, jobs: [] },
    { key: 'waitingOnParts', totalCount: 0, jobs: [] },
    { key: 'unscheduled', totalCount: 0, jobs: [] },
    { key: 'open', totalCount: 0, jobs: [] }
  ];

  workspace.jobs.forEach((job) => {
    if (job.status === 'completed' || job.status === 'closed' || job.status === 'cancelled') {
      return;
    }

    const queueKey = job.needsOfficeReview
      ? 'review'
      : job.status === 'waitingOnParts'
        ? 'waitingOnParts'
        : job.needsScheduling
          ? 'unscheduled'
          : 'open';
    const section = queues.find((candidate) => candidate.key === queueKey);

    section?.jobs.push({
      id: job.id,
      jobNumber: job.jobNumber,
      locationId: job.locationId,
      locationName: job.locationName,
      billToCustomerId: job.billToCustomerId,
      billToCustomerName: job.billToCustomerName,
      jobType: job.jobType,
      category: job.category,
      origin: job.origin,
      summary: job.summary,
      status: job.status,
      workOrderNumber: job.workOrderNumber,
      needsScheduling: job.needsScheduling,
      needsOfficeReview: job.needsOfficeReview,
      nextAppointment: job.appointments[0]
        ? {
            id: job.appointments[0].id,
            jobId: job.appointments[0].jobId,
            scheduledDate: job.appointments[0].scheduledDate,
            scheduledStartTime: job.appointments[0].scheduledStartTime,
            scheduledEndTime: job.appointments[0].scheduledEndTime,
            timeWindowLabel: job.appointments[0].timeWindowLabel,
            technicianId: job.appointments[0].technicianId,
            technicianName: job.appointments[0].technicianName,
            status: job.appointments[0].status,
            needsOfficeReview: job.appointments[0].needsOfficeReview
          }
        : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  });

  return {
    limit: 20,
    queues: queues.map((section) => ({ ...section, totalCount: section.jobs.length }))
  };
}

function buildJobIntakeContext(workspace: JobsWorkspaceResponse): JobIntakeContextResponse {
  return {
    technicians: workspace.technicians
  };
}

function buildJobDetail(
  job: JobSummary,
  registerEntries: RegisterEntrySummary[] = [],
  mediaAttachments: MediaAttachmentSummary[] = [],
  technicians: JobsWorkspaceResponse['technicians'] = buildWorkspace([job]).technicians
): JobDetailResponse {
  return {
    job,
    location: buildWorkspace([job]).locations[0],
    billToCustomer: buildWorkspace([job]).customers[0],
    technicians,
    equipment: [],
    registerEntries,
    mediaAttachments,
    timelineLimit: 50,
    timelineHasMore: false
  };
}

function arrangeWorkspace(workspace: JobsWorkspaceResponse) {
  mockedIdentityApi.getCurrentOfficeSession.mockResolvedValue({ employee });
  mockedOperationsApi.getOfficeJobIntakeContext.mockResolvedValue(buildJobIntakeContext(workspace));
  mockedOperationsApi.getOfficeJobsQueue.mockResolvedValue(buildJobsQueue(workspace));
  mockedOperationsApi.getOfficeJobsWorkspace.mockResolvedValue(workspace);
  mockedOperationsApi.getOfficeDispatchBoard.mockResolvedValue(buildDispatchBoard(workspace));
  mockedOperationsApi.searchOfficeCrm.mockResolvedValue({
    query: 'main',
    results: [buildLocationSearchResult(workspace)]
  });
  mockedOperationsApi.getOfficeLocationDetail.mockImplementation(async ({ locationId }) =>
    buildLocationDetail(workspace, locationId)
  );
  mockedOperationsApi.getOfficeCustomerDetail.mockImplementation(async ({ customerId }) =>
    buildCustomerDetail(workspace, customerId)
  );
  mockedOperationsApi.getOfficeJobDetail.mockImplementation(async ({ jobId }) => {
    const job =
      workspace.jobs.find((candidate) => candidate.id === jobId) ?? workspace.jobs[0] ?? buildJob();
    return buildJobDetail(job, [], [], workspace.technicians);
  });
  mockedOperationsApi.getOfficeEquipmentWorkspace.mockResolvedValue({
    locations: [],
    equipment: [],
    suggestedEquipmentTypes: []
  });
  mockedOperationsApi.getOfficeServiceAgreementReferenceData.mockResolvedValue({
    customers: workspace.customers,
    locations: workspace.locations,
    equipment: []
  });
  mockedOperationsApi.listOfficeServiceAgreements.mockResolvedValue({ agreements: [] });
  mockedOperationsApi.getOfficeRegisterEntries.mockResolvedValue({ registerEntries: [] });
  mockedOperationsApi.getOfficeMediaAttachments.mockResolvedValue({ mediaAttachments: [] });
  mockedOperationsApi.getOfficeMediaBlob.mockResolvedValue(new Blob(['media-bytes']));
  mockedOperationsApi.createOfficeCustomer.mockResolvedValue({
    customer: buildCustomerDetail(workspace)
  });
  mockedOperationsApi.createOfficeLocation.mockResolvedValue({
    location: buildLocationDetail(workspace)
  });
  mockedOperationsApi.createOfficeJob.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeAppointmentSchedule.mockResolvedValue(
    workspace.jobs[0] ?? buildJob()
  );
  mockedOperationsApi.updateOfficeAppointmentStatus.mockResolvedValue(
    workspace.jobs[0] ?? buildJob()
  );
  mockedOperationsApi.updateOfficeJobStatus.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.addOfficeAppointment.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.acknowledgeOfficeFinishedVisitReview.mockResolvedValue(
    workspace.jobs[0] ?? buildJob()
  );
  mockedOperationsApi.updateOfficeRegisterEntry.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.voidOfficeRegisterEntry.mockResolvedValue(workspace.jobs[0] ?? buildJob());
  mockedOperationsApi.updateOfficeMediaAttachment.mockResolvedValue({
    mediaAttachment: buildMediaAttachment()
  });
  mockedOperationsApi.voidOfficeMediaAttachment.mockResolvedValue({
    mediaAttachment: buildMediaAttachment({ isVoid: true })
  });
}

function renderShell({
  initialEmployee = employee,
  onSignOut = vi.fn(),
  onSessionExpired = vi.fn()
}: {
  initialEmployee?: EmployeeSummary;
  onSignOut?: () => void;
  onSessionExpired?: (message: string) => void;
} = {}) {
  return render(
    <OfficeWorkspaceShell
      apiBaseUrl="http://api.test"
      initialEmployee={initialEmployee}
      sessionToken="session-token"
      onSignOut={onSignOut}
      onSessionExpired={onSessionExpired}
    />
  );
}

async function selectJobIntakeLocationBySearch(query = 'Main') {
  fireEvent.change(await screen.findByLabelText('Job location search'), {
    target: { value: query }
  });

  await waitFor(() => {
    expect(mockedOperationsApi.searchOfficeCrm).toHaveBeenCalledWith({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      query
    });
  });

  fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));

  await waitFor(() => {
    expect(mockedOperationsApi.getOfficeLocationDetail).toHaveBeenCalledWith({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      locationId: 'location-1'
    });
  });
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
    expect(screen.queryByRole('region', { name: 'Jobs queue' })).not.toBeInTheDocument();
    expect(mockedOperationsApi.getOfficeJobIntakeContext).not.toHaveBeenCalled();
    expect(mockedOperationsApi.getOfficeEquipmentWorkspace).not.toHaveBeenCalled();
  });

  it('uses a compact toggle account menu instead of the old top bar actions', async () => {
    const onSignOut = vi.fn();
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell({ onSignOut });

    await screen.findByRole('region', { name: 'Dispatch board' });
    expect(screen.queryByText('office@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();

    const accountButton = screen.getByRole('button', { name: 'Account menu for Office User' });
    expect(accountButton).toHaveTextContent('OU');
    expect(screen.queryByRole('menu', { name: 'Account menu' })).not.toBeInTheDocument();

    fireEvent.click(accountButton);
    expect(screen.getByRole('menu', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.getByText('office@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Account menu' })).not.toBeInTheDocument();
  });

  it('runs workspace refresh from the compact account menu and closes the menu', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    await screen.findByRole('region', { name: 'Dispatch board' });
    const initialSessionCallCount = mockedIdentityApi.getCurrentOfficeSession.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Office User' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh workspace' }));

    await waitFor(() => {
      expect(mockedIdentityApi.getCurrentOfficeSession.mock.calls.length).toBeGreaterThan(
        initialSessionCallCount
      );
    });
    expect(screen.queryByRole('menu', { name: 'Account menu' })).not.toBeInTheDocument();
  });

  it('reports an expired session from workspace refresh without leaving the workspace active', async () => {
    const onSessionExpired = vi.fn();
    arrangeWorkspace(buildWorkspace([buildJob()]));
    mockedIdentityApi.getCurrentOfficeSession
      .mockResolvedValueOnce({ employee })
      .mockRejectedValueOnce(
        new OfficeIdentityApiError('Session expired. Please sign in again.', 401, 'sessionExpired')
      );

    renderShell({ onSessionExpired });

    await screen.findByRole('region', { name: 'Dispatch board' });
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Office User' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh workspace' }));

    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledWith('Session expired. Please sign in again.');
    });
  });

  it('hides the Employees nav without employeesPermissions:view', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()])); // default employee has no permissions
    renderShell();
    await screen.findByRole('region', { name: 'Dispatch board' });
    expect(screen.queryByRole('button', { name: 'Employees' })).not.toBeInTheDocument();
  });

  it('shows the Employees nav with employeesPermissions:view', async () => {
    const viewer: EmployeeSummary = {
      ...employee,
      effectivePermissions: ['employeesPermissions:view']
    };
    arrangeWorkspace(buildWorkspace([buildJob()]));
    mockedIdentityApi.getCurrentOfficeSession.mockResolvedValue({ employee: viewer });
    render(
      <OfficeWorkspaceShell
        apiBaseUrl="http://api.test"
        initialEmployee={viewer}
        sessionToken="session-token"
        onSignOut={vi.fn()}
      />
    );
    expect(await screen.findByRole('button', { name: 'Employees' })).toBeInTheDocument();
  });

  it('shows Agreements only with agreements:view and opens the workbench', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()])); // default employee has no permissions
    const firstRender = renderShell();
    await screen.findByRole('region', { name: 'Dispatch board' });
    expect(screen.queryByRole('button', { name: 'Agreements' })).not.toBeInTheDocument();
    firstRender.unmount();

    vi.clearAllMocks();
    const viewer: EmployeeSummary = {
      ...employee,
      effectivePermissions: ['agreements:view']
    };
    arrangeWorkspace(buildWorkspace([buildJob()]));
    mockedIdentityApi.getCurrentOfficeSession.mockResolvedValue({ employee: viewer });
    renderShell({ initialEmployee: viewer });

    fireEvent.click(await screen.findByRole('button', { name: 'Agreements' }));
    expect(await screen.findByRole('region', { name: 'Agreements' })).toBeInTheDocument();
    expect(mockedOperationsApi.listOfficeServiceAgreements).toHaveBeenCalled();
  });

  it('switches between Dispatch, Customers, and Jobs from the rail', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    expect(await screen.findByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equipment' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
    expect(await screen.findByRole('region', { name: 'CRM panel mock' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dispatch board' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jobs' }));
    expect(await screen.findByRole('region', { name: 'Jobs queue' })).toBeInTheDocument();
    expect(mockedOperationsApi.getOfficeEquipmentWorkspace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dispatch' }));
    expect(await screen.findByRole('region', { name: 'Dispatch board' })).toBeInTheDocument();
  });

  it('opens New job as a focused intake view from Customers and closes back', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Customers' }));
    expect(await screen.findByRole('region', { name: 'CRM panel mock' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New job' }));
    expect(await screen.findByRole('region', { name: 'New job' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'CRM panel mock' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Job type')).toBeInTheDocument();
    expect(screen.getByLabelText('Job problem summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create job' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('region', { name: 'CRM panel mock' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New job' })).not.toBeInTheDocument();
  });

  it('opens job detail from a dispatch appointment card on overview with appointment focus preserved', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Job 1001, Acme/i));

    expect(await screen.findByRole('region', { name: 'Job 1001 detail' })).toBeInTheDocument();
    expect(mockedOperationsApi.getOfficeJobDetail).toHaveBeenCalledWith({
      jobId: 'job-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Appointment end time')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Appointments' }));
    expect(screen.getByLabelText('Appointment end time')).toHaveValue('10:00');
  });

  it('updates appointment scheduling from the dispatch quick schedule popover', async () => {
    const scheduledDate = '2026-05-23';
    const workspace = buildWorkspace([buildJob()]);
    workspace.technicians.push({ id: 'tech-2', displayName: 'Jamie Tech', roleId: 'technician' });
    arrangeWorkspace(workspace);

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Dispatch actions for job 1001' }));
    const actionMenu = await screen.findByRole('menu', { name: 'Dispatch actions for job 1001' });
    fireEvent.click(within(actionMenu).getByRole('menuitem', { name: 'Edit schedule' }));
    const scheduleDialog = await screen.findByRole('dialog', {
      name: 'Edit schedule for job 1001'
    });

    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment date'), {
      target: { value: scheduledDate }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment start time'), {
      target: { value: '09:30' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment end time'), {
      target: { value: '11:45' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment time window'), {
      target: { value: '9:30 AM - 11:45 AM' }
    });
    fireEvent.change(within(scheduleDialog).getByLabelText('Dispatch appointment technician'), {
      target: { value: 'tech-2' }
    });
    fireEvent.click(within(scheduleDialog).getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith({
        appointmentId: 'appointment-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        scheduledDate,
        scheduledStartTime: '09:30',
        scheduledEndTime: '11:45',
        timeWindowLabel: '9:30 AM - 11:45 AM',
        technicianId: 'tech-2'
      });
    });
    expect(await screen.findByText('Appointment updated.')).toBeInTheDocument();
  });

  it('updates appointment status from the dispatch card actions menu', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.contextMenu(await screen.findByLabelText(/Job 1001, Acme/i), {
      clientX: 120,
      clientY: 140
    });
    const menu = await screen.findByRole('menu', { name: 'Dispatch actions for job 1001' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Change status to Dispatched' }));

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentStatus).toHaveBeenCalledWith({
        appointmentId: 'appointment-1',
        status: 'dispatched',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test'
      });
    });
    expect(await screen.findByText('Appointment updated.')).toBeInTheDocument();
  });

  it('updates appointment duration from the dispatch resize handle', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    const resizeHandle = await screen.findByRole('button', {
      name: 'Resize job 1001 duration'
    });
    fireEvent.pointerDown(resizeHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 196 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appointment-1',
          sessionToken: 'session-token',
          apiBaseUrl: 'http://api.test',
          scheduledDate: expect.any(String),
          scheduledStartTime: '08:00',
          scheduledEndTime: '11:00',
          timeWindowLabel: '8:00 AM - 11:00 AM',
          technicianId: 'tech-1'
        })
      );
    });
    expect(await screen.findByText('Appointment updated.')).toBeInTheDocument();
  });

  it('updates appointment time from dispatch card drag move', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    const cardButton = await screen.findByLabelText(/Job 1001, Acme/i);
    fireEvent.pointerDown(cardButton, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 196 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appointment-1',
          sessionToken: 'session-token',
          apiBaseUrl: 'http://api.test',
          scheduledDate: expect.any(String),
          scheduledStartTime: '09:00',
          scheduledEndTime: '11:00',
          timeWindowLabel: '9:00 AM - 11:00 AM',
          technicianId: 'tech-1'
        })
      );
    });
    expect(await screen.findByText('Appointment updated.')).toBeInTheDocument();
  });

  it('updates appointment technician from dispatch row reassignment', async () => {
    const workspace = buildWorkspace([buildJob()]);
    workspace.technicians.push({ id: 'tech-2', displayName: 'Jamie Tech', roleId: 'technician' });
    arrangeWorkspace(workspace);

    renderShell();

    const jamieRow = await screen.findByRole('region', {
      name: 'Appointments for Jamie Tech'
    });
    const restoreElementFromPoint = stubElementFromPoint(jamieRow);

    try {
      const cardButton = await screen.findByLabelText(/Job 1001, Acme/i);
      fireEvent.pointerDown(cardButton, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 132 });
      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(mockedOperationsApi.updateOfficeAppointmentSchedule).toHaveBeenCalledWith(
          expect.objectContaining({
            appointmentId: 'appointment-1',
            sessionToken: 'session-token',
            apiBaseUrl: 'http://api.test',
            scheduledDate: expect.any(String),
            scheduledStartTime: '08:00',
            scheduledEndTime: '10:00',
            timeWindowLabel: undefined,
            technicianId: 'tech-2'
          })
        );
      });
      expect(await screen.findByText('Appointment updated.')).toBeInTheDocument();
    } finally {
      restoreElementFromPoint();
    }
  });

  it('opens job location and customer records in CRM and returns to the job', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Job 1001, Acme/i));
    expect(await screen.findByRole('region', { name: 'Job 1001 detail' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open location Main Shop' }));

    expect(await screen.findByRole('region', { name: 'CRM panel mock' })).toBeInTheDocument();
    expect(screen.getByText('CRM target: location location-1')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Job 1001 detail' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to source job' }));
    expect(await screen.findByRole('region', { name: 'Job 1001 detail' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open customer Acme' }));

    expect(await screen.findByRole('region', { name: 'CRM panel mock' })).toBeInTheDocument();
    expect(screen.getByText('CRM target: customer customer-1')).toBeInTheDocument();
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

  it('loads more jobs queue rows through the compact queue API', async () => {
    const initialWorkspace = buildWorkspace([
      buildJob({
        id: 'job-open',
        jobNumber: '1002',
        summary: 'Open first'
      })
    ]);
    const secondJob = buildJob({
      id: 'job-open-2',
      jobNumber: '1003',
      summary: 'Open second'
    });
    const initialQueue = buildJobsQueue(initialWorkspace);
    initialQueue.queues = initialQueue.queues.map((section) =>
      section.key === 'open' ? { ...section, totalCount: 2, nextCursor: 'cursor-open' } : section
    );
    const nextQueue = buildJobsQueue(buildWorkspace([secondJob]));

    arrangeWorkspace(initialWorkspace);
    mockedOperationsApi.getOfficeJobsQueue
      .mockResolvedValueOnce(initialQueue)
      .mockResolvedValueOnce(nextQueue);

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Jobs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more Open' }));

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeJobsQueue).toHaveBeenLastCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        limit: 20,
        cursors: { open: 'cursor-open' }
      });
    });
    expect(await screen.findByText('Open second')).toBeInTheDocument();
  });

  it('creates jobs from the focused new-job form using the existing API helper', async () => {
    const today = getTodayDateInputValue();
    const problemSummary = 'No heat\nCustomer reports the furnace stopped overnight.';
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    expect(await screen.findByRole('region', { name: 'New job' })).toBeInTheDocument();
    expect(mockedOperationsApi.getOfficeJobIntakeContext).toHaveBeenCalledWith({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    expect(screen.getByRole('button', { name: 'Create job' })).toBeDisabled();
    expect(screen.queryByLabelText('Bill to')).not.toBeInTheDocument();
    expect(mockedOperationsApi.getOfficeLocationDetail).not.toHaveBeenCalled();

    await selectJobIntakeLocationBySearch('Main');
    expect(await screen.findByText('123 Main, Blaine, WA, 98230')).toBeInTheDocument();
    expect(screen.getByText('Location owner: Acme')).toBeInTheDocument();
    expect(screen.getByText('Acme (location owner)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bill to')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Job type'), { target: { value: 'Maintenance' } });
    fireEvent.change(screen.getByLabelText('Job category'), { target: { value: 'Warranty' } });
    fireEvent.change(screen.getByLabelText('Job origin'), { target: { value: 'Email' } });
    fireEvent.change(screen.getByLabelText('Job problem summary'), {
      target: { value: problemSummary }
    });
    fireEvent.change(screen.getByLabelText('Job dispatch date'), { target: { value: today } });
    fireEvent.change(screen.getByLabelText('Job scheduled start'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Job scheduled end'), { target: { value: '11:00' } });
    fireEvent.change(screen.getByLabelText('Job customer arrival window'), {
      target: { value: '10:00 AM - 12:00 PM' }
    });
    fireEvent.change(screen.getByLabelText('Technician'), { target: { value: 'tech-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }));

    await waitFor(() => {
      expect(mockedOperationsApi.createOfficeJob).toHaveBeenCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        locationId: 'location-1',
        jobType: 'Maintenance',
        category: 'Warranty',
        origin: 'Email',
        summary: problemSummary,
        scheduledDate: today,
        scheduledStartTime: '09:00',
        scheduledEndTime: '11:00',
        timeWindowLabel: '10:00 AM - 12:00 PM',
        technicianId: 'tech-1'
      });
    });
    expect(await screen.findByText('Job created.')).toBeInTheDocument();
    expect(mockedOperationsApi.createOfficeJob.mock.calls[0]?.[0]).not.toHaveProperty(
      'billToCustomerId'
    );
  });

  it('keeps blank customer arrival window out of the create-job payload', async () => {
    arrangeWorkspace(buildWorkspace([buildJob()]));

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    await selectJobIntakeLocationBySearch('Main');
    fireEvent.change(await screen.findByLabelText('Job problem summary'), {
      target: { value: 'Replace filter' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }));

    await waitFor(() => {
      expect(mockedOperationsApi.createOfficeJob).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Replace filter',
          timeWindowLabel: undefined
        })
      );
    });
  });

  it('lets dispatch select a customer search result before choosing one of that customer’s active locations', async () => {
    const workspace = buildWorkspace([buildJob()]);
    arrangeWorkspace(workspace);
    mockedOperationsApi.searchOfficeCrm.mockResolvedValue({
      query: 'Acme',
      results: [buildCustomerSearchResult(workspace)]
    });

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    fireEvent.change(await screen.findByLabelText('Job location search'), {
      target: { value: 'Acme' }
    });

    await waitFor(() => {
      expect(mockedOperationsApi.searchOfficeCrm).toHaveBeenCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        query: 'Acme'
      });
    });

    const searchResults = await screen.findByLabelText('Job location search results');
    fireEvent.click(within(searchResults).getByRole('button', { name: /Acme/ }));

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeCustomerDetail).toHaveBeenCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        customerId: 'customer-1'
      });
    });

    const customerLocations = await screen.findByLabelText('Customer locations');
    fireEvent.click(within(customerLocations).getByRole('button', { name: /Main Shop/ }));

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeLocationDetail).toHaveBeenCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        locationId: 'location-1'
      });
    });
    expect(await screen.findByText('123 Main, Blaine, WA, 98230')).toBeInTheDocument();
    expect(screen.getByText('Location owner: Acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create job' })).not.toBeDisabled();
  });

  it('keeps a customer with no active locations inside intake with Add location available', async () => {
    const workspace = buildWorkspace([buildJob()]);
    workspace.customers.push({
      id: 'customer-no-location',
      name: 'No Location Customer',
      accountType: 'residential',
      billingAddressLine1: '44 No Place',
      billingCity: 'Blaine',
      billingState: 'WA',
      billingPostalCode: '98230',
      isActive: true,
      flags: []
    });
    arrangeWorkspace(workspace);
    mockedOperationsApi.searchOfficeCrm.mockResolvedValue({
      query: 'No Location',
      results: [buildCustomerSearchResult(workspace, 'customer-no-location')]
    });

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    fireEvent.change(await screen.findByLabelText('Job location search'), {
      target: { value: 'No Location' }
    });

    const searchResults = await screen.findByLabelText('Job location search results');
    fireEvent.click(within(searchResults).getByRole('button', { name: /No Location Customer/ }));

    expect(await screen.findByText('No Location Customer')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No active locations found for No Location Customer. Add a service location to continue.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add location' })).toBeInTheDocument();
    expect(screen.queryByText(/Open Customers/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Job type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create job' })).toBeDisabled();
  });

  it('warns on inline duplicate customer creation before continuing to location creation', async () => {
    const workspace = buildWorkspace([buildJob()]);
    arrangeWorkspace(workspace);
    mockedOperationsApi.searchOfficeCrm.mockResolvedValue({
      query: 'Acme',
      results: [buildCustomerSearchResult(workspace)]
    });

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New customer' }));
    fireEvent.change(await screen.findByLabelText('Customer name'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByRole('group', { name: 'Duplicate warnings' })).toBeInTheDocument();
    expect(mockedOperationsApi.createOfficeCustomer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Create customer anyway' }));

    await waitFor(() => {
      expect(mockedOperationsApi.createOfficeCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme',
          confirmDuplicate: true,
          sessionToken: 'session-token',
          apiBaseUrl: 'http://api.test'
        })
      );
    });
    expect(await screen.findByRole('group', { name: 'Add location' })).toBeInTheDocument();
  });

  it('confirms missing contact info during inline location creation before selecting it', async () => {
    const workspace = buildWorkspace([buildJob()]);
    workspace.customers.push({
      id: 'customer-no-location',
      name: 'No Location Customer',
      accountType: 'residential',
      billingAddressLine1: '44 No Place',
      billingCity: 'Blaine',
      billingState: 'WA',
      billingPostalCode: '98230',
      isActive: true,
      flags: []
    });
    const createdLocation: LocationDetail = {
      id: 'created-location',
      name: 'New Service Location',
      customerId: 'customer-no-location',
      customerName: 'No Location Customer',
      addressLine1: '55 Service Way',
      city: 'Blaine',
      state: 'WA',
      postalCode: '98230',
      isActive: true,
      contactMethods: [],
      contacts: [],
      alternateBillToCustomerIds: [],
      ownershipHistory: [],
      operational: emptyOperationalContext()
    };
    arrangeWorkspace(workspace);
    mockedOperationsApi.searchOfficeCrm.mockResolvedValue({
      query: 'No Location',
      results: [buildCustomerSearchResult(workspace, 'customer-no-location')]
    });
    mockedOperationsApi.createOfficeLocation.mockResolvedValue({ location: createdLocation });
    mockedOperationsApi.getOfficeLocationDetail.mockImplementation(async ({ locationId }) =>
      locationId === 'created-location'
        ? createdLocation
        : buildLocationDetail(workspace, locationId)
    );

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    fireEvent.change(await screen.findByLabelText('Job location search'), {
      target: { value: 'No Location' }
    });
    const searchResults = await screen.findByLabelText('Job location search results');
    fireEvent.click(within(searchResults).getByRole('button', { name: /No Location Customer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));

    fireEvent.change(await screen.findByLabelText('Location name'), {
      target: { value: 'New Service Location' }
    });
    fireEvent.change(screen.getByLabelText('Service street'), {
      target: { value: '55 Service Way' }
    });
    fireEvent.change(screen.getByLabelText('Service city'), { target: { value: 'Blaine' } });
    fireEvent.change(screen.getByLabelText('Service state'), { target: { value: 'WA' } });
    fireEvent.change(screen.getByLabelText('Service ZIP'), { target: { value: '98230' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));

    expect(
      await screen.findByText(
        'This location has no phone or email. Confirm this is intentional before creating it.'
      )
    ).toBeInTheDocument();
    expect(mockedOperationsApi.createOfficeLocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Create location without phone or email' }));

    await waitFor(() => {
      expect(mockedOperationsApi.createOfficeLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-no-location',
          name: 'New Service Location',
          addressLine1: '55 Service Way',
          confirmMissingContactInfo: true,
          sessionToken: 'session-token',
          apiBaseUrl: 'http://api.test'
        })
      );
    });
    expect(await screen.findByText('New Service Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Job type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create job' })).not.toBeDisabled();
  });

  it('uses customer search for a job-only customer override', async () => {
    const workspace = buildWorkspace([buildJob()]);
    workspace.customers.push({
      id: 'customer-2',
      name: 'Morgan Property Management',
      accountType: 'company',
      billingAddressLine1: '500 Billing Way',
      billingCity: 'Blaine',
      billingState: 'WA',
      billingPostalCode: '98230',
      isActive: true,
      flags: []
    });
    const location = workspace.locations[0];

    if (!location) {
      throw new Error('Test workspace needs a location.');
    }

    arrangeWorkspace(workspace);
    mockedOperationsApi.searchOfficeCrm
      .mockResolvedValueOnce({
        query: 'Main',
        results: [buildLocationSearchResult(workspace)]
      })
      .mockResolvedValueOnce({
        query: 'Morgan',
        results: [buildCustomerSearchResult(workspace, 'customer-2')]
      });

    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'New job' }));
    await selectJobIntakeLocationBySearch('Main');

    fireEvent.click(screen.getByRole('button', { name: 'Change customer for this job' }));
    fireEvent.change(await screen.findByLabelText('Job customer search'), {
      target: { value: 'Morgan' }
    });
    const customerResults = await screen.findByLabelText('Job customer search results');
    fireEvent.click(
      within(customerResults).getByRole('button', { name: /Morgan Property Management/ })
    );

    expect(await screen.findByText('Morgan Property Management')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use location owner' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }));

    await waitFor(() => {
      expect(mockedOperationsApi.createOfficeJob).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: 'location-1',
          billToCustomerId: 'customer-2'
        })
      );
    });
  });

  it('saves appointment schedule and status changes from job detail through existing API helpers', async () => {
    const scheduledDate = '2026-06-02';
    const workspace = buildWorkspace([buildJob()]);
    workspace.technicians.push({ id: 'tech-2', displayName: 'Jamie Tech', roleId: 'technician' });
    arrangeWorkspace(workspace);

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Job 1001, Acme/i));
    fireEvent.click(await screen.findByRole('button', { name: 'Appointments' }));
    const appointment = await screen.findByRole('region', { name: 'Appointment appointment-1' });
    fireEvent.change(within(appointment).getByLabelText('Appointment date'), {
      target: { value: scheduledDate }
    });
    fireEvent.change(within(appointment).getByLabelText('Appointment start time'), {
      target: { value: '09:30' }
    });
    fireEvent.change(within(appointment).getByLabelText('Appointment end time'), {
      target: { value: '11:15' }
    });
    fireEvent.change(within(appointment).getByLabelText('Appointment time window'), {
      target: { value: '9:30 AM - 11:15 AM' }
    });
    fireEvent.change(within(appointment).getByLabelText('Appointment technician'), {
      target: { value: 'tech-2' }
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
        scheduledDate,
        scheduledStartTime: '09:30',
        scheduledEndTime: '11:15',
        timeWindowLabel: '9:30 AM - 11:15 AM',
        technicianId: 'tech-2'
      });
    });
    expect(await screen.findByText('Appointment updated.')).toBeInTheDocument();
  });

  it('shows appointment-specific copy after adding an appointment from job detail', async () => {
    const scheduledDate = '2026-06-03';
    const workspace = buildWorkspace([buildJob()]);
    arrangeWorkspace(workspace);

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Job 1001, Acme/i));
    fireEvent.click(await screen.findByRole('button', { name: 'Appointments' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add appointment' }));
    const addAppointment = await screen.findByRole('region', { name: 'Add appointment' });
    fireEvent.change(within(addAppointment).getByLabelText('New appointment date'), {
      target: { value: scheduledDate }
    });
    fireEvent.click(within(addAppointment).getByRole('button', { name: 'Add appointment' }));

    await waitFor(() => {
      expect(mockedOperationsApi.addOfficeAppointment).toHaveBeenCalledWith({
        jobId: 'job-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        scheduledDate,
        scheduledStartTime: undefined,
        scheduledEndTime: undefined,
        timeWindowLabel: undefined,
        technicianId: undefined
      });
    });
    expect(await screen.findByText('Appointment added.')).toBeInTheDocument();
    expect(screen.queryByText('Follow-up added.')).not.toBeInTheDocument();
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

    fireEvent.click(await screen.findByLabelText(/Job 1001, Acme/i));
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
    mockedOperationsApi.getOfficeJobDetail.mockResolvedValue(
      buildJobDetail(job, [registerEntry], [mediaAttachment])
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:media-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    renderShell();

    fireEvent.click(await screen.findByLabelText(/Job 1001, Acme/i));
    fireEvent.click(await screen.findByRole('button', { name: 'Captured' }));

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeJobDetail).toHaveBeenCalledWith({
        jobId: 'job-1',
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test'
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
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

    expect(await screen.findByLabelText(/Job 1001, Acme/i)).toBeInTheDocument();
    expect(intervalHandlers.size).toBe(1);

    await act(async () => {
      [...intervalHandlers.values()][0]?.();
    });

    await waitFor(() => {
      expect(mockedOperationsApi.getOfficeDispatchBoard).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/Job 1001, Acme/i)).not.toBeInTheDocument();
    });
  });
});
