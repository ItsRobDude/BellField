import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JobsAppointmentsService } from './jobs-appointments.service';
import type { JobRecord } from '../company-data/company-data.types';

function createService() {
  const referenceDataService = {
    listCustomers: jest.fn().mockResolvedValue([]),
    listLocations: jest.fn().mockResolvedValue([]),
    getLocationById: jest.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Main Shop',
      customerId: 'customer-1',
      addressLine1: '123 Main',
      city: 'Blaine',
      state: 'WA',
      postalCode: '98230',
      alternateBillToCustomerIds: []
    }),
    getLocationDetail: jest.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Main Shop',
      customerId: 'customer-1',
      customerName: 'Acme',
      addressLine1: '123 Main',
      city: 'Blaine',
      state: 'WA',
      postalCode: '98230',
      phone: undefined,
      email: undefined,
      fax: undefined,
      isActive: true,
      contacts: [],
      alternateBillToCustomerIds: []
    }),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme',
      accountType: 'company',
      billingAddressLine1: '123 Main',
      billingCity: 'Blaine',
      billingState: 'WA',
      billingPostalCode: '98230',
      phone: undefined,
      email: undefined,
      fax: undefined,
      isActive: true,
      flags: []
    })
  };
  const equipmentDataService = {
    listEquipment: jest.fn().mockResolvedValue([])
  };
  const jobsDataService = {
    getJobById: jest.fn(),
    listJobs: jest.fn().mockResolvedValue([]),
    hasFutureAppointments: jest.fn().mockResolvedValue(false),
    hasCancellableAppointments: jest.fn().mockResolvedValue(false),
    countCancellableAppointments: jest.fn().mockResolvedValue(0),
    hasIncompleteAppointments: jest.fn().mockResolvedValue(false),
    updateJobStatus: jest.fn(),
    createAppointment: jest.fn(),
    acknowledgeFinishedVisitReview: jest.fn(),
    updateAppointmentSchedule: jest.fn(),
    getAppointmentById: jest.fn(),
    updateAppointmentStatus: jest.fn(),
    addSyncFlag: jest.fn(),
    listAssignedJobsForEmployee: jest.fn().mockResolvedValue([]),
    addJobNote: jest.fn(),
    listRegisterEntriesForJob: jest.fn().mockResolvedValue([]),
    getRegisterEntryById: jest.fn(),
    findRegisterEntryByClientOperationId: jest.fn().mockResolvedValue(null),
    createRegisterEntry: jest.fn(),
    updateRegisterEntry: jest.fn(),
    voidRegisterEntry: jest.fn()
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn(),
    getActiveEmployees: jest.fn().mockResolvedValue([]),
    getEmployeeSummaryById: jest.fn().mockResolvedValue(null)
  };

  return {
    service: new JobsAppointmentsService(
      referenceDataService as never,
      equipmentDataService as never,
      jobsDataService as never,
      identityAccessService as never
    ),
    referenceDataService,
    jobsDataService,
    identityAccessService
  };
}

function createJob(status: JobRecord['status']): JobRecord {
  return {
    id: 'job-1',
    jobNumber: '1001',
    locationId: 'location-1',
    billToCustomerId: 'customer-1',
    jobType: 'service',
    category: 'service',
    origin: 'phone',
    summary: 'No cooling',
    status,
    appointmentIds: [],
    timeline: [],
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z'
  };
}

function createRegisterEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'register-1',
    jobId: 'job-1',
    appointmentId: 'appointment-1',
    kind: 'part',
    description: 'Contactor',
    quantity: 1,
    unitOfMeasure: 'each',
    unitPrice: 125,
    totalAmount: 125,
    partNumber: 'C-100',
    inventorySourceLabel: 'truck',
    capturedByEmployeeId: 'tech-1',
    capturedByName: 'Field Tech',
    capturedAt: '2026-04-14T11:00:00.000Z',
    isVoid: false,
    createdAt: '2026-04-14T11:00:00.000Z',
    updatedAt: '2026-04-14T11:00:00.000Z',
    ...overrides
  };
}

describe('JobsAppointmentsService', () => {
  it('returns compact job intake context without listing jobs', async () => {
    const { service, referenceDataService, jobsDataService, identityAccessService } =
      createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:view'],
      sessionSurface: 'office-web'
    });
    identityAccessService.getActiveEmployees.mockResolvedValue([
      { id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' },
      { id: 'office-1', displayName: 'Dispatcher', roleId: 'dispatcher' }
    ]);

    const response = await service.getIntakeContext('session-token');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'jobs:view',
      ['office-web']
    );
    expect(jobsDataService.listJobs).not.toHaveBeenCalled();
    expect(referenceDataService.getLocationDetail).not.toHaveBeenCalled();
    expect(referenceDataService.listCustomers).not.toHaveBeenCalled();
    expect(referenceDataService.listLocations).not.toHaveBeenCalled();
    expect(response).toEqual({
      technicians: [{ id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' }]
    });
  });

  it('keeps finished appointments in office review until they are acknowledged', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:view'],
      sessionSurface: 'office-web'
    });
    const job = { ...createJob('inProgress'), appointmentIds: ['appointment-1'] };
    jobsDataService.listJobs.mockResolvedValue([job]);
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'finished',
      scheduledDate: '2026-04-15',
      scheduledStartTime: '08:00',
      scheduledEndTime: '10:00',
      timeWindowLabel: 'Morning',
      updatedAt: '2026-04-14T11:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });

    const response = await service.getWorkspace('session-token');

    expect(response.jobs[0]?.needsOfficeReview).toBe(true);
    expect(response.jobs[0]?.appointments[0]).toMatchObject({
      scheduledStartTime: '08:00',
      scheduledEndTime: '10:00',
      needsOfficeReview: true
    });
  });

  it.each(['completed', 'closed', 'cancelled'] as const)(
    'does not require office review for finished appointments under %s jobs',
    async (status) => {
      const { service, jobsDataService, identityAccessService } = createService();
      identityAccessService.getAuthorizedEmployee.mockResolvedValue({
        id: 'office-1',
        displayName: 'Dispatcher',
        effectivePermissions: ['jobs:view'],
        sessionSurface: 'office-web'
      });
      const job = { ...createJob(status), appointmentIds: ['appointment-1'] };
      jobsDataService.listJobs.mockResolvedValue([job]);
      jobsDataService.getAppointmentById.mockResolvedValue({
        id: 'appointment-1',
        jobId: 'job-1',
        status: 'finished',
        updatedAt: '2026-04-14T11:00:00.000Z',
        createdAt: '2026-04-14T09:00:00.000Z'
      });

      const response = await service.getWorkspace('session-token');

      expect(response.jobs[0]?.needsOfficeReview).toBe(false);
      expect(response.jobs[0]?.appointments[0]?.needsOfficeReview).toBe(false);
    }
  );

  it('clears review need after a finished appointment is acknowledged', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:view'],
      sessionSurface: 'office-web'
    });
    const job = { ...createJob('inProgress'), appointmentIds: ['appointment-1'] };
    jobsDataService.listJobs.mockResolvedValue([job]);
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'finished',
      finishedReviewedAt: '2026-04-14T12:00:00.000Z',
      finishedReviewedBy: 'Dispatcher',
      finishedReviewDecision: 'keptOpen',
      updatedAt: '2026-04-14T12:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });

    const response = await service.getWorkspace('session-token');

    expect(response.jobs[0]?.needsOfficeReview).toBe(false);
    expect(response.jobs[0]?.appointments[0]).toMatchObject({
      needsOfficeReview: false,
      finishedReviewDecision: 'keptOpen'
    });
  });

  it('acknowledges keep-open review decisions and returns the updated job summary', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.acknowledgeFinishedVisitReview.mockResolvedValue(createJob('inProgress'));

    const response = await service.acknowledgeFinishedVisitReview('session-token', 'job-1', {
      decision: 'keptOpen',
      occurredAt: '2026-04-14T11:00:00.000Z'
    });

    expect(jobsDataService.acknowledgeFinishedVisitReview).toHaveBeenCalledWith(
      'job-1',
      'keptOpen',
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );
    expect(response.id).toBe('job-1');
  });

  it('rejects adding appointments to closed jobs', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['appointmentsDispatch:create'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('closed'));

    await expect(service.addAppointment('session-token', 'job-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('requires configure permission before reopening completed jobs', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('completed'));

    await expect(
      service.updateJobStatus('session-token', 'job-1', { status: 'scheduled' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [0, 'Cancelling this job will not cancel any appointments because none are active.'],
    [1, 'Cancelling this job will also cancel 1 appointment under it.'],
    [3, 'Cancelling this job will also cancel 3 appointments under it.']
  ])(
    'warns with the cancellable appointment count when cancelling a job',
    async (count, warning) => {
      const { service, jobsDataService, identityAccessService } = createService();
      identityAccessService.getAuthorizedEmployee.mockResolvedValue({
        id: 'office-1',
        displayName: 'Dispatcher',
        effectivePermissions: ['jobs:edit'],
        sessionSurface: 'office-web'
      });
      jobsDataService.getJobById.mockResolvedValue(createJob('scheduled'));
      jobsDataService.countCancellableAppointments.mockResolvedValue(count);
      jobsDataService.updateJobStatus.mockResolvedValue(createJob('cancelled'));

      const response = await service.updateJobStatus('session-token', 'job-1', {
        status: 'cancelled',
        occurredAt: '2026-04-14T11:00:00.000Z'
      });

      expect(response.warningMessages).toContain(warning);
      expect(response.warningMessages?.join(' ')).not.toMatch(/future/i);
      expect(jobsDataService.hasFutureAppointments).not.toHaveBeenCalled();
      expect(jobsDataService.countCancellableAppointments).toHaveBeenCalledWith('job-1');
    }
  );

  it('warns clearly before closing a job that still has future appointments', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('completed'));
    jobsDataService.hasFutureAppointments.mockResolvedValue(true);
    jobsDataService.updateJobStatus.mockResolvedValue(createJob('closed'));

    const response = await service.updateJobStatus('session-token', 'job-1', {
      status: 'closed',
      occurredAt: '2026-04-14T11:00:00.000Z'
    });

    expect(response.warningMessages).toContain(
      'This job still has future appointments scheduled. Confirm before closing it out.'
    );
    expect(jobsDataService.hasFutureAppointments).toHaveBeenCalledWith('job-1', '2026-04-14');
  });

  it('warns that reopening keeps history and allows follow-up appointments', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:configure'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('closed'));
    jobsDataService.updateJobStatus.mockResolvedValue(createJob('scheduled'));

    const response = await service.updateJobStatus('session-token', 'job-1', {
      status: 'scheduled',
      occurredAt: '2026-04-14T11:00:00.000Z'
    });

    expect(response.warningMessages).toContain(
      'Reopening this job keeps prior appointments and history intact, and follow-up appointments can be added under this job.'
    );
    // The status the permission decision was made against is forwarded so the repository can
    // reject under the lock if it changed (guards a concurrent un-permissioned reopen).
    expect(jobsDataService.updateJobStatus).toHaveBeenCalledWith(
      'job-1',
      'scheduled',
      'Dispatcher',
      '2026-04-14T11:00:00.000Z',
      'closed'
    );
  });

  it('rejects out-of-scope field appointment updates without replay provenance', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('scheduled');

    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'scheduled',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.getJobById.mockResolvedValue(job);

    const response = await service.updateAppointmentStatus('session-token', 'appointment-1', {
      status: 'working',
      occurredAt: '2026-04-14T11:00:00.000Z'
    });

    expect(response.syncResult).toEqual({
      status: 'rejected',
      message:
        'This field change is outside the current assigned-work scope and could not be validated as an offline replay.'
    });
    expect(jobsDataService.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it('preserves offline field appointment updates after assignment changes when replay provenance is present', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('scheduled');

    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'scheduled',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.getJobById.mockResolvedValue(job);
    jobsDataService.updateAppointmentStatus.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'working',
      updatedAt: '2026-04-14T12:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });

    const response = await service.updateAppointmentStatus('session-token', 'appointment-1', {
      status: 'working',
      occurredAt: '2026-04-14T11:00:00.000Z',
      baseUpdatedAt: '2026-04-14T10:00:00.000Z',
      syncSource: 'field-save-queue'
    });

    expect(response.syncResult).toEqual({ status: 'applied' });
    expect(jobsDataService.addSyncFlag).toHaveBeenCalledWith(
      'job-1',
      'Field appointment update synced after assignment changed while the device was offline.',
      'Field Tech',
      expect.any(String)
    );
  });

  it('rejects field appointment cancellation by default', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'scheduled',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('scheduled'));

    await expect(
      service.updateAppointmentStatus('session-token', 'appointment-1', { status: 'cancelled' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires structured finish review fields for field finish actions', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'working',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('inProgress'));

    await expect(
      service.updateAppointmentStatus('session-token', 'appointment-1', { status: 'finished' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires appointmentsDispatch:edit when changing appointment status', async () => {
    const { service, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(
      new ForbiddenException('You do not have permission to perform this action.')
    );

    await expect(
      service.updateAppointmentStatus('session-token', 'appointment-1', { status: 'arrived' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'appointmentsDispatch:edit'
    );
  });

  it('lets office dispatchers with appointmentsDispatch:edit cancel an appointment', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'scheduled',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('scheduled'));
    jobsDataService.updateAppointmentStatus.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'cancelled',
      updatedAt: '2026-04-14T11:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });

    await service.updateAppointmentStatus('session-token', 'appointment-1', {
      status: 'cancelled'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'appointmentsDispatch:edit'
    );
    expect(jobsDataService.updateAppointmentStatus).toHaveBeenCalledWith(
      'appointment-1',
      'cancelled',
      'Dispatcher',
      undefined,
      undefined
    );
  });

  it.each(['noAnswer', 'finished'] as const)(
    'does not auto-close the parent job when an appointment is marked %s',
    async (status) => {
      const { service, jobsDataService, identityAccessService } = createService();
      const job = createJob('inProgress');
      identityAccessService.getAuthorizedEmployee.mockResolvedValue({
        id: 'office-1',
        displayName: 'Dispatcher',
        effectivePermissions: ['appointmentsDispatch:edit'],
        sessionSurface: 'office-web'
      });
      jobsDataService.getAppointmentById.mockResolvedValue({
        id: 'appointment-1',
        jobId: 'job-1',
        status: 'working',
        updatedAt: '2026-04-14T10:00:00.000Z',
        createdAt: '2026-04-14T09:00:00.000Z'
      });
      jobsDataService.getJobById.mockResolvedValue(job);
      jobsDataService.updateAppointmentStatus.mockResolvedValue({
        id: 'appointment-1',
        jobId: 'job-1',
        status,
        updatedAt: '2026-04-14T11:00:00.000Z',
        createdAt: '2026-04-14T09:00:00.000Z'
      });

      await service.updateAppointmentStatus('session-token', 'appointment-1', {
        status,
        ...(status === 'finished' ? { finishOutcome: 'completed', hasChargeActivity: true } : {})
      });

      expect(jobsDataService.updateJobStatus).not.toHaveBeenCalled();
    }
  );

  it('keeps a job needing scheduling when its only appointment is cancelled, even if it had a date', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:view'],
      sessionSurface: 'office-web'
    });
    const job = { ...createJob('scheduled'), appointmentIds: ['appointment-1'] };
    jobsDataService.listJobs.mockResolvedValue([job]);
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'cancelled',
      scheduledDate: '2026-04-15',
      updatedAt: '2026-04-14T11:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });

    const response = await service.getWorkspace('session-token');

    expect(response.jobs[0]?.needsScheduling).toBe(true);
    expect(response.jobs[0]?.appointments[0]?.status).toBe('cancelled');
    expect(response.jobs[0]?.needsOfficeReview).toBe(false);
  });

  it('writes a sync flag note when a valid field replay lands after the job was cancelled', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('cancelled');
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.listAssignedJobsForEmployee.mockResolvedValue([]);
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'working',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.getJobById.mockResolvedValue(job);
    jobsDataService.updateAppointmentStatus.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'working',
      updatedAt: '2026-04-14T12:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });

    await service.updateAppointmentStatus('session-token', 'appointment-1', {
      status: 'working',
      occurredAt: '2026-04-14T11:00:00.000Z',
      baseUpdatedAt: '2026-04-14T10:00:00.000Z',
      syncSource: 'field-save-queue'
    });

    expect(jobsDataService.listAssignedJobsForEmployee).toHaveBeenCalled();
    expect(jobsDataService.addSyncFlag).toHaveBeenCalledWith(
      'job-1',
      'Field appointment update synced after the job had already been cancelled.',
      'Field Tech',
      expect.any(String)
    );
  });

  it('includes register entries on job summaries', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:view', 'register:view'],
      sessionSurface: 'office-web'
    });
    jobsDataService.listJobs.mockResolvedValue([createJob('inProgress')]);
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([createRegisterEntry()]);

    const response = await service.getWorkspace('session-token');

    expect(response.jobs[0]?.registerEntries).toEqual([
      expect.objectContaining({
        id: 'register-1',
        description: 'Contactor',
        totalAmount: 125
      })
    ]);
  });

  it('omits register entries from job summaries without register:view', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:view'],
      sessionSurface: 'office-web'
    });
    jobsDataService.listJobs.mockResolvedValue([createJob('inProgress')]);
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([createRegisterEntry()]);

    const response = await service.getWorkspace('session-token');

    expect(response.jobs[0]?.registerEntries).toBeUndefined();
    expect(jobsDataService.listRegisterEntriesForJob).not.toHaveBeenCalled();
  });

  it('creates register entries with register:create permission and returns the updated job summary', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('inProgress');
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['register:view', 'register:create'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getJobById.mockResolvedValue(job);
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'working',
      updatedAt: '2026-04-14T10:00:00.000Z',
      createdAt: '2026-04-14T09:00:00.000Z'
    });
    jobsDataService.listAssignedJobsForEmployee.mockResolvedValue([job]);
    jobsDataService.createRegisterEntry.mockResolvedValue(createRegisterEntry());
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([createRegisterEntry()]);

    const response = await service.createRegisterEntry('session-token', 'job-1', {
      appointmentId: 'appointment-1',
      kind: 'part',
      description: 'Contactor',
      quantity: 1,
      unitOfMeasure: 'each',
      unitPrice: 125,
      totalAmount: 125,
      occurredAt: '2026-04-14T11:00:00.000Z',
      baseUpdatedAt: '2026-04-14T10:00:00.000Z',
      syncSource: 'field-save-queue'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'register:create'
    );
    expect(jobsDataService.createRegisterEntry).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ description: 'Contactor' }),
      expect.objectContaining({ id: 'tech-1', displayName: 'Field Tech' }),
      '2026-04-14T11:00:00.000Z',
      false // not a preserved replay
    );
    expect(response.syncResult).toEqual({ status: 'applied' });
    expect(response.registerEntries?.[0]?.description).toBe('Contactor');
  });

  it('short-circuits an idempotent replay without re-creating the line', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['register:view', 'register:create'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('inProgress'));
    jobsDataService.findRegisterEntryByClientOperationId.mockResolvedValue(createRegisterEntry());
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([createRegisterEntry()]);

    const response = await service.createRegisterEntry('session-token', 'job-1', {
      kind: 'part',
      description: 'Contactor',
      quantity: 1,
      totalAmount: 125,
      clientOperationId: 'op-7',
      syncSource: 'field-save-queue'
    });

    expect(jobsDataService.findRegisterEntryByClientOperationId).toHaveBeenCalledWith('op-7');
    // The replay returns success with the current job summary and never re-creates the line.
    expect(jobsDataService.createRegisterEntry).not.toHaveBeenCalled();
    expect(response.syncResult).toEqual({ status: 'applied' });
  });

  it('rejects out-of-scope field register creates without replay provenance', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('inProgress');
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['register:view', 'register:create'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getJobById.mockResolvedValue(job);
    jobsDataService.listAssignedJobsForEmployee.mockResolvedValue([]);

    const response = await service.createRegisterEntry('session-token', 'job-1', {
      kind: 'labor',
      description: 'Diagnostic labor',
      quantity: 1,
      unitPrice: 95,
      totalAmount: 95
    });

    expect(jobsDataService.createRegisterEntry).not.toHaveBeenCalled();
    expect(response.syncResult).toEqual({
      status: 'rejected',
      message:
        'This field change is outside the current assigned-work scope and could not be validated as an offline replay.'
    });
  });

  it('rejects direct register entry creates on cancelled jobs', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['register:create'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('cancelled'));

    await expect(
      service.createRegisterEntry('session-token', 'job-1', {
        kind: 'labor',
        description: 'Diagnostic labor',
        quantity: 1,
        unitPrice: 95,
        totalAmount: 95
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(jobsDataService.createRegisterEntry).not.toHaveBeenCalled();
  });

  it('preserves queued field register creates after a job was cancelled', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('cancelled');
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['register:view', 'register:create'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getJobById.mockResolvedValue(job);
    jobsDataService.listAssignedJobsForEmployee.mockResolvedValue([]);
    jobsDataService.createRegisterEntry.mockResolvedValue(createRegisterEntry());
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([createRegisterEntry()]);

    const response = await service.createRegisterEntry('session-token', 'job-1', {
      kind: 'part',
      description: 'Contactor',
      quantity: 1,
      unitPrice: 125,
      totalAmount: 125,
      occurredAt: '2026-04-14T11:00:00.000Z',
      baseUpdatedAt: '2026-04-14T10:00:00.000Z',
      syncSource: 'field-save-queue'
    });

    expect(jobsDataService.createRegisterEntry).toHaveBeenCalled();
    expect(jobsDataService.addSyncFlag).toHaveBeenCalledWith(
      'job-1',
      'Field register entry synced after the job had already been cancelled.',
      'Field Tech',
      expect.any(String)
    );
    expect(response.syncResult).toEqual({ status: 'applied' });
  });

  it('blocks a cost-bearing register entry on a finalized (completed) job', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['register:view', 'register:create'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('completed'));

    await expect(
      service.createRegisterEntry('session-token', 'job-1', {
        kind: 'part',
        description: 'Late part',
        quantity: 1,
        totalAmount: 50
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(jobsDataService.createRegisterEntry).not.toHaveBeenCalled();
  });

  it('flags stale field register updates as conflicts', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job = createJob('inProgress');
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['register:view', 'register:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getRegisterEntryById.mockResolvedValue(
      createRegisterEntry({ updatedAt: '2026-04-14T12:00:00.000Z' })
    );
    jobsDataService.getJobById.mockResolvedValue(job);
    jobsDataService.listAssignedJobsForEmployee.mockResolvedValue([job]);

    const response = await service.updateRegisterEntry('session-token', 'register-1', {
      description: 'Updated contactor',
      occurredAt: '2026-04-14T11:30:00.000Z',
      baseUpdatedAt: '2026-04-14T11:00:00.000Z',
      syncSource: 'field-save-queue'
    });

    expect(jobsDataService.updateRegisterEntry).not.toHaveBeenCalled();
    expect(jobsDataService.addSyncFlag).toHaveBeenCalledWith(
      'job-1',
      'Field register entry update conflicted with a newer BellField register change.',
      'Field Tech',
      expect.any(String)
    );
    expect(response.syncResult).toEqual({
      status: 'conflict',
      message: 'Register entry changed before this offline update could sync.'
    });
  });

  it('accepts an update that only changes the billing projection state', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['register:view', 'register:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getRegisterEntryById.mockResolvedValue(createRegisterEntry());
    jobsDataService.getJobById.mockResolvedValue(createJob('inProgress'));
    jobsDataService.updateRegisterEntry.mockResolvedValue(
      createRegisterEntry({ billingProjectionState: 'noChargeShown' })
    );
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([
      createRegisterEntry({ billingProjectionState: 'noChargeShown' })
    ]);

    await service.updateRegisterEntry('session-token', 'register-1', {
      billingProjectionState: 'noChargeShown'
    });

    // billingProjectionState alone is an editable field — the update must not be rejected.
    expect(jobsDataService.updateRegisterEntry).toHaveBeenCalled();
  });

  it('voids register entries through register:edit without deleting history', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['register:view', 'register:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getRegisterEntryById.mockResolvedValue(createRegisterEntry());
    jobsDataService.getJobById.mockResolvedValue(createJob('inProgress'));
    jobsDataService.voidRegisterEntry.mockResolvedValue(
      createRegisterEntry({ isVoid: true, voidReason: 'Duplicate line.' })
    );
    jobsDataService.listRegisterEntriesForJob.mockResolvedValue([
      createRegisterEntry({ isVoid: true, voidReason: 'Duplicate line.' })
    ]);

    const response = await service.voidRegisterEntry('session-token', 'register-1', {
      reason: 'Duplicate line.',
      occurredAt: '2026-04-14T12:00:00.000Z'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'register:edit'
    );
    expect(jobsDataService.voidRegisterEntry).toHaveBeenCalledWith(
      'register-1',
      'Duplicate line.',
      { id: 'office-1', displayName: 'Dispatcher' },
      '2026-04-14T12:00:00.000Z'
    );
    expect(response.registerEntries?.[0]).toMatchObject({
      isVoid: true,
      voidReason: 'Duplicate line.'
    });
  });
});
