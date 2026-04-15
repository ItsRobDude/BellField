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
      contactIds: [],
      alternateBillToCustomerIds: [],
      historyNotes: []
    }),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme',
      accountType: 'company',
      flags: []
    })
  };
  const equipmentDataService = {
    listEquipment: jest.fn().mockResolvedValue([])
  };
  const jobsDataService = {
    getJobById: jest.fn(),
    hasFutureAppointments: jest.fn().mockResolvedValue(false),
    updateJobStatus: jest.fn(),
    createAppointment: jest.fn(),
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
    referenceDataService,
    jobsDataService,
    identityAccessService
  };
}

describe('JobsAppointmentsService', () => {
  it('rejects adding appointments to non-open jobs', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['appointmentsDispatch:create'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue({
      id: 'job-1',
      status: 'closed'
    });

    await expect(service.addAppointment('session-token', 'job-1', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires invoice posting permission before posting jobs', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['jobs:edit'],
      sessionSurface: 'office-web'
    });
    jobsDataService.getJobById.mockResolvedValue({
      id: 'job-1',
      status: 'open'
    });

    await expect(
      service.updateJobStatus('session-token', 'job-1', { status: 'posted' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects out-of-scope field appointment updates without replay provenance', async () => {
    const { service, jobsDataService, identityAccessService } = createService();
    const job: JobRecord = {
      id: 'job-1',
      jobNumber: '1001',
      locationId: 'location-1',
      billToCustomerId: 'customer-1',
      jobType: 'service',
      category: 'service',
      origin: 'phone',
      summary: 'No cooling',
      status: 'open',
      appointmentIds: [],
      timeline: [],
      createdAt: '2026-04-14T10:00:00.000Z',
      updatedAt: '2026-04-14T10:00:00.000Z'
    };

    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'assigned',
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
    const job: JobRecord = {
      id: 'job-1',
      jobNumber: '1001',
      locationId: 'location-1',
      billToCustomerId: 'customer-1',
      jobType: 'service',
      category: 'service',
      origin: 'phone',
      summary: 'No cooling',
      status: 'open',
      appointmentIds: [],
      timeline: [],
      createdAt: '2026-04-14T10:00:00.000Z',
      updatedAt: '2026-04-14T10:00:00.000Z'
    };

    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['appointmentsDispatch:edit'],
      sessionSurface: 'field-mobile'
    });
    jobsDataService.getAppointmentById.mockResolvedValue({
      id: 'appointment-1',
      jobId: 'job-1',
      status: 'assigned',
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
});
