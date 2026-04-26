import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JobsAppointmentsService } from './jobs-appointments.service';
import type { JobRecord } from '../company-data/company-data.types';

function createService() {
  const referenceDataService = {
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
    hasFutureAppointments: jest.fn().mockResolvedValue(false),
    hasCancellableAppointments: jest.fn().mockResolvedValue(false),
    countCancellableAppointments: jest.fn().mockResolvedValue(0),
    hasIncompleteAppointments: jest.fn().mockResolvedValue(false),
    updateJobStatus: jest.fn(),
    createAppointment: jest.fn(),
    updateAppointmentSchedule: jest.fn(),
    getAppointmentById: jest.fn(),
    updateAppointmentStatus: jest.fn(),
    addSyncFlag: jest.fn(),
    listAssignedJobsForEmployee: jest.fn().mockResolvedValue([]),
    addJobNote: jest.fn()
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

describe('JobsAppointmentsService', () => {
  it('rejects adding appointments to closed jobs', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['appointmentsDispatch:create'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue(createJob('closed'));

    await expect(service.addAppointment('session-token', 'job-1', {})).rejects.toBeInstanceOf(ConflictException);
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
  ])('warns with the cancellable appointment count when cancelling a job', async (count, warning) => {
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
    expect(jobsDataService.hasFutureAppointments).not.toHaveBeenCalled();
    expect(jobsDataService.countCancellableAppointments).toHaveBeenCalledWith('job-1');
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
});
