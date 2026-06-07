import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppointmentSummary,
  CustomerAccountSummary,
  JobSummary,
  JobsWorkspaceResponse,
  LocationSummary,
  MediaAttachmentSummary,
  RegisterEntrySummary
} from '@/lib/operations-api';
import { JobDetailPanel } from './job-detail-panel';
import type { CapturedWorkDetails } from './job-work-types';

const baseTimestamp = '2026-05-22T10:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appt-1',
    jobId: 'job-1',
    scheduledDate: '2026-05-22',
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

function buildWorkspace(job = buildJob()): JobsWorkspaceResponse {
  return {
    customers: [],
    locations: [],
    technicians: [{ id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' }],
    jobs: [job]
  };
}

function buildLocation(overrides: Partial<LocationSummary> = {}): LocationSummary {
  return {
    id: 'location-1',
    name: 'Main Shop',
    customerId: 'customer-1',
    customerName: 'Acme',
    addressLine1: '123 Main',
    city: 'Blaine',
    state: 'WA',
    postalCode: '98230',
    phone: '555-0100',
    email: 'shop@example.com',
    isActive: true,
    contacts: [
      {
        id: 'contact-link-1',
        contactId: 'contact-1',
        displayName: 'Casey Contact',
        phone: '555-0111',
        email: 'casey@example.com',
        tags: [],
        isActive: true,
        hasOverrides: false,
        sharedContact: {
          id: 'contact-1',
          displayName: 'Casey Contact',
          phone: '555-0111',
          email: 'casey@example.com',
          tags: [],
          isActive: true
        },
        linkedRecord: {
          id: 'location-1',
          kind: 'location',
          name: 'Main Shop',
          subtitle: 'Acme'
        }
      }
    ],
    alternateBillToCustomerIds: [],
    ...overrides
  };
}

function buildCustomer(overrides: Partial<CustomerAccountSummary> = {}): CustomerAccountSummary {
  return {
    id: 'customer-1',
    name: 'Acme',
    accountType: 'company',
    billingAddressLine1: '456 Billing',
    billingCity: 'Blaine',
    billingState: 'WA',
    billingPostalCode: '98230',
    phone: '555-0200',
    email: 'billing@example.com',
    isActive: true,
    flags: [],
    ...overrides
  };
}

function buildRegisterEntry(overrides: Partial<RegisterEntrySummary> = {}): RegisterEntrySummary {
  return {
    id: 'register-1',
    jobId: 'job-1',
    appointmentId: 'appt-1',
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
    appointmentId: 'appt-1',
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

function buildCapturedWork(
  registerEntries: RegisterEntrySummary[] = [],
  mediaAttachments: MediaAttachmentSummary[] = []
): CapturedWorkDetails {
  return {
    isOpen: true,
    isLoading: false,
    registerEntries,
    mediaAttachments,
    registerDrafts: Object.fromEntries(
      registerEntries.map((entry) => [
        entry.id,
        {
          appointmentId: entry.appointmentId ?? '',
          kind: entry.kind,
          description: entry.description,
          quantity: String(entry.quantity),
          unitOfMeasure: entry.unitOfMeasure ?? '',
          unitPrice: entry.unitPrice === undefined ? '' : String(entry.unitPrice),
          totalAmount: String(entry.totalAmount),
          partNumber: entry.partNumber ?? '',
          inventorySourceLabel: entry.inventorySourceLabel ?? ''
        }
      ])
    ),
    mediaCaptionDrafts: Object.fromEntries(
      mediaAttachments.map((media) => [media.id, media.caption ?? ''])
    ),
    registerVoidReasons: {},
    mediaVoidReasons: {}
  };
}

function renderDetail(
  input: {
    job?: JobSummary;
    initialTab?: 'overview' | 'appointments' | 'captured' | 'media' | 'timeline';
    focusedAppointmentId?: string | null;
    capturedWork?: CapturedWorkDetails;
    handlers?: Partial<Parameters<typeof JobDetailPanel>[0]>;
  } = {}
) {
  const job = input.job ?? buildJob();
  const props: Parameters<typeof JobDetailPanel>[0] = {
    technicians: buildWorkspace(job).technicians,
    job,
    location: buildLocation(),
    billToCustomer: buildCustomer(),
    apiBaseUrl: 'http://localhost',
    sessionToken: 'test-token',
    canCreateEstimate: true,
    canEditEstimate: true,
    canApproveEstimate: true,
    canViewInvoice: true,
    canEditInvoice: true,
    canPostInvoice: true,
    canConvertEstimate: true,
    canViewJobCosting: true,
    canCreateJobCosting: true,
    canEditJobCosting: true,
    paymentPermissions: { canView: true, canRecord: true, canVoid: true },
    initialTab: input.initialTab,
    focusedAppointmentId: input.focusedAppointmentId,
    equipmentCount: 2,
    registerEntryCount: input.capturedWork?.registerEntries.length ?? 1,
    mediaAttachmentCount: input.capturedWork?.mediaAttachments.length ?? 1,
    pendingJobStatusChange: null,
    appointmentDrafts: {},
    appointmentEditDrafts: {},
    capturedWork: input.capturedWork,
    onBack: vi.fn(),
    onOpenCustomer: vi.fn(),
    onOpenLocation: vi.fn(),
    onLoadCapturedWork: vi.fn(async () => undefined),
    onJobStatusReviewRequested: vi.fn(),
    onConfirmJobStatusChange: vi.fn(async () => undefined),
    onCancelJobStatusChange: vi.fn(),
    onAppointmentStatusChange: vi.fn(async () => undefined),
    onAppointmentDraftChange: vi.fn(),
    onAppointmentEditDraftChange: vi.fn(),
    onSaveAppointmentSchedule: vi.fn(async () => undefined),
    onAddAppointment: vi.fn(async () => undefined),
    onKeepJobOpen: vi.fn(async () => undefined),
    onRegisterDraftChange: vi.fn(),
    onSaveRegisterEntry: vi.fn(async () => undefined),
    onRegisterVoidReasonChange: vi.fn(),
    onVoidRegisterEntry: vi.fn(async () => undefined),
    onMediaCaptionChange: vi.fn(),
    onSaveMediaCaption: vi.fn(async () => undefined),
    onMediaVoidReasonChange: vi.fn(),
    onVoidMediaAttachment: vi.fn(async () => undefined),
    onOpenMediaAttachment: vi.fn(async () => undefined),
    ...input.handlers
  };

  render(<JobDetailPanel {...props} />);

  return props;
}

describe('JobDetailPanel', () => {
  it('shows focused job detail tabs without the old crowded job-card surface', () => {
    renderDetail();

    expect(screen.getByRole('heading', { name: 'Job 1001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appointments' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Captured' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Jobs and appointments' })
    ).not.toBeInTheDocument();
  });

  it('opens service location and customer records from the overview', () => {
    const onOpenLocation = vi.fn();
    const onOpenCustomer = vi.fn();

    renderDetail({
      handlers: {
        onOpenLocation,
        onOpenCustomer
      }
    });

    expect(screen.getByRole('heading', { name: 'Service Location' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bill To' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open location Main Shop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open customer Acme' }));

    expect(onOpenLocation).toHaveBeenCalledWith('location-1', 'job-1');
    expect(onOpenCustomer).toHaveBeenCalledWith('customer-1', 'job-1');
  });

  it('renders operational overview context at a glance', () => {
    renderDetail();

    expect(screen.getByRole('heading', { name: 'Job Summary / Office Notes' })).toBeInTheDocument();
    expect(screen.getAllByText('No cooling').length).toBeGreaterThan(0);
    expect(screen.getByText('123 Main, Blaine, WA 98230')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
    expect(screen.getByText('Casey Contact phone')).toBeInTheDocument();
    expect(screen.getByText('456 Billing, Blaine, WA 98230')).toBeInTheDocument();
    expect(screen.getByText('2026-05-22 - 8:00 AM - 10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Equipment on site')).toBeInTheDocument();
  });

  it('edits appointment schedule and status from the appointments tab', () => {
    const onAppointmentStatusChange = vi.fn(async () => undefined);
    const onAppointmentEditDraftChange = vi.fn();
    const onSaveAppointmentSchedule = vi.fn(async () => undefined);

    renderDetail({
      initialTab: 'appointments',
      focusedAppointmentId: 'appt-1',
      handlers: {
        onAppointmentStatusChange,
        onAppointmentEditDraftChange,
        onSaveAppointmentSchedule
      }
    });

    const appointment = screen.getByRole('region', { name: 'Appointment appt-1' });
    const startTimeInput = within(appointment).getByLabelText('Appointment start time');
    const endTimeInput = within(appointment).getByLabelText('Appointment end time');
    expect(startTimeInput).toHaveAttribute('type', 'text');
    expect(startTimeInput).toHaveAttribute('placeholder', 'HH:MM');
    expect(endTimeInput).toHaveAttribute('type', 'text');
    expect(endTimeInput).toHaveAttribute('placeholder', 'HH:MM');
    fireEvent.change(startTimeInput, { target: { value: '09:00' } });
    fireEvent.change(endTimeInput, { target: { value: '11:00' } });
    fireEvent.change(within(appointment).getByLabelText('Appointment time window'), {
      target: { value: '9:00 AM - 11:00 AM' }
    });
    fireEvent.change(within(appointment).getByLabelText('Status'), {
      target: { value: 'confirmed' }
    });
    fireEvent.click(within(appointment).getByRole('button', { name: 'Save appointment' }));

    const baseDraft = {
      scheduledDate: '2026-05-22',
      scheduledStartTime: '08:00',
      scheduledEndTime: '10:00',
      timeWindowLabel: '',
      technicianId: 'tech-1'
    };
    expect(onAppointmentEditDraftChange).toHaveBeenNthCalledWith(1, 'appt-1', baseDraft, {
      scheduledStartTime: '09:00'
    });
    expect(onAppointmentEditDraftChange).toHaveBeenNthCalledWith(2, 'appt-1', baseDraft, {
      scheduledEndTime: '11:00'
    });
    expect(onAppointmentEditDraftChange).toHaveBeenNthCalledWith(3, 'appt-1', baseDraft, {
      timeWindowLabel: '9:00 AM - 11:00 AM'
    });
    expect(onAppointmentStatusChange).toHaveBeenCalledWith('appt-1', 'confirmed');
    expect(onSaveAppointmentSchedule).toHaveBeenCalledWith('appt-1');
  });

  it('keeps the add-appointment form collapsed until requested', () => {
    renderDetail({ initialTab: 'appointments' });

    expect(screen.queryByRole('region', { name: 'Add appointment' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add appointment' }));

    const addAppointment = screen.getByRole('region', { name: 'Add appointment' });
    expect(within(addAppointment).getByLabelText('New appointment date')).toBeInTheDocument();
    expect(within(addAppointment).getByLabelText('New appointment start time')).toBeInTheDocument();

    fireEvent.click(within(addAppointment).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('region', { name: 'Add appointment' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add appointment' })).toBeInTheDocument();
  });

  it('requires confirmation before cancelling an appointment', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onAppointmentStatusChange = vi.fn(async () => undefined);

    renderDetail({
      initialTab: 'appointments',
      handlers: {
        onAppointmentStatusChange
      }
    });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cancelled' } });

    expect(confirmSpy).toHaveBeenCalledWith('Cancel this appointment?');
    expect(onAppointmentStatusChange).not.toHaveBeenCalled();
  });

  it('keeps finished-visit review actions on the job detail surface', () => {
    const onJobStatusReviewRequested = vi.fn();
    const onAddAppointment = vi.fn(async () => undefined);
    const onKeepJobOpen = vi.fn(async () => undefined);
    const job = buildJob({
      needsOfficeReview: true,
      appointments: [buildAppointment({ status: 'finished', needsOfficeReview: true })]
    });

    renderDetail({
      job,
      handlers: {
        onJobStatusReviewRequested,
        onAddAppointment,
        onKeepJobOpen
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follow-up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));

    expect(onJobStatusReviewRequested).toHaveBeenCalledWith(
      'job-1',
      'scheduled',
      'completed',
      'No cooling'
    );
    expect(onAddAppointment).toHaveBeenCalledWith('job-1');
    expect(onKeepJobOpen).toHaveBeenCalledWith('job-1');
  });

  it('loads and edits captured register entries from the captured tab', async () => {
    const onLoadCapturedWork = vi.fn(async () => undefined);
    const onRegisterDraftChange = vi.fn();
    const onSaveRegisterEntry = vi.fn(async () => undefined);
    const onRegisterVoidReasonChange = vi.fn();
    const onVoidRegisterEntry = vi.fn(async () => undefined);
    const registerEntry = buildRegisterEntry();

    const { rerender } = render(
      <JobDetailPanel
        {...renderProps({
          onLoadCapturedWork,
          onRegisterDraftChange,
          onSaveRegisterEntry,
          onRegisterVoidReasonChange,
          onVoidRegisterEntry
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Captured' }));

    await waitFor(() => {
      expect(onLoadCapturedWork).toHaveBeenCalledWith('job-1');
    });

    rerender(
      <JobDetailPanel
        {...renderProps({
          initialTab: 'captured',
          capturedWork: buildCapturedWork([registerEntry]),
          onLoadCapturedWork,
          onRegisterDraftChange,
          onSaveRegisterEntry,
          onRegisterVoidReasonChange,
          onVoidRegisterEntry
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Register quantity for Diagnostic capacitor'), {
      target: { value: '2' }
    });
    fireEvent.change(screen.getByLabelText('Void reason for Diagnostic capacitor'), {
      target: { value: 'duplicate' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));

    expect(onRegisterDraftChange).toHaveBeenCalledWith(
      'job-1',
      'register-1',
      expect.objectContaining({ quantity: '2' })
    );
    expect(onRegisterVoidReasonChange).toHaveBeenCalledWith('job-1', 'register-1', 'duplicate');
    expect(onSaveRegisterEntry).toHaveBeenCalledWith('job-1', 'register-1');
    expect(onVoidRegisterEntry).toHaveBeenCalledWith('job-1', 'register-1');
  });

  it('edits, opens, and voids media from the media tab', () => {
    const onMediaCaptionChange = vi.fn();
    const onSaveMediaCaption = vi.fn(async () => undefined);
    const onMediaVoidReasonChange = vi.fn();
    const onVoidMediaAttachment = vi.fn(async () => undefined);
    const onOpenMediaAttachment = vi.fn(async () => undefined);
    const media = buildMediaAttachment();

    renderDetail({
      initialTab: 'media',
      capturedWork: buildCapturedWork([], [media]),
      handlers: {
        onMediaCaptionChange,
        onSaveMediaCaption,
        onMediaVoidReasonChange,
        onVoidMediaAttachment,
        onOpenMediaAttachment
      }
    });

    fireEvent.change(screen.getByLabelText('Media caption for compressor.jpg'), {
      target: { value: 'After cleaning' }
    });
    fireEvent.change(screen.getByLabelText('Void reason for compressor.jpg'), {
      target: { value: 'wrong file' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));

    expect(onMediaCaptionChange).toHaveBeenCalledWith('job-1', 'media-1', 'After cleaning');
    expect(onMediaVoidReasonChange).toHaveBeenCalledWith('job-1', 'media-1', 'wrong file');
    expect(onSaveMediaCaption).toHaveBeenCalledWith('job-1', 'media-1');
    expect(onOpenMediaAttachment).toHaveBeenCalledWith('job-1', 'media-1');
    expect(onVoidMediaAttachment).toHaveBeenCalledWith('job-1', 'media-1');
  });

  it('shows timeline entries in the timeline tab', () => {
    renderDetail({ initialTab: 'timeline' });

    expect(screen.getByText(/Job scheduled./)).toBeInTheDocument();
  });
});

function renderProps(
  overrides: Partial<Parameters<typeof JobDetailPanel>[0]> = {}
): Parameters<typeof JobDetailPanel>[0] {
  const job = overrides.job ?? buildJob();
  return {
    technicians: buildWorkspace(job).technicians,
    job,
    location: buildLocation(),
    billToCustomer: buildCustomer(),
    apiBaseUrl: 'http://localhost',
    sessionToken: 'test-token',
    canCreateEstimate: true,
    canEditEstimate: true,
    canApproveEstimate: true,
    canViewInvoice: true,
    canEditInvoice: true,
    canPostInvoice: true,
    canConvertEstimate: true,
    canViewJobCosting: true,
    canCreateJobCosting: true,
    canEditJobCosting: true,
    paymentPermissions: { canView: true, canRecord: true, canVoid: true },
    equipmentCount: 2,
    registerEntryCount: overrides.capturedWork?.registerEntries.length ?? 1,
    mediaAttachmentCount: overrides.capturedWork?.mediaAttachments.length ?? 1,
    pendingJobStatusChange: null,
    appointmentDrafts: {},
    appointmentEditDrafts: {},
    onBack: vi.fn(),
    onOpenCustomer: vi.fn(),
    onOpenLocation: vi.fn(),
    onLoadCapturedWork: vi.fn(async () => undefined),
    onJobStatusReviewRequested: vi.fn(),
    onConfirmJobStatusChange: vi.fn(async () => undefined),
    onCancelJobStatusChange: vi.fn(),
    onAppointmentStatusChange: vi.fn(async () => undefined),
    onAppointmentDraftChange: vi.fn(),
    onAppointmentEditDraftChange: vi.fn(),
    onSaveAppointmentSchedule: vi.fn(async () => undefined),
    onAddAppointment: vi.fn(async () => undefined),
    onKeepJobOpen: vi.fn(async () => undefined),
    onRegisterDraftChange: vi.fn(),
    onSaveRegisterEntry: vi.fn(async () => undefined),
    onRegisterVoidReasonChange: vi.fn(),
    onVoidRegisterEntry: vi.fn(async () => undefined),
    onMediaCaptionChange: vi.fn(),
    onSaveMediaCaption: vi.fn(async () => undefined),
    onMediaVoidReasonChange: vi.fn(),
    onVoidMediaAttachment: vi.fn(async () => undefined),
    onOpenMediaAttachment: vi.fn(async () => undefined),
    ...overrides
  };
}
