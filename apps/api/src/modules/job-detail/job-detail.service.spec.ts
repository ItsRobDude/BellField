import { BadRequestException } from '@nestjs/common';
import { JobDetailService } from './job-detail.service';

const timestamp = '2026-05-23T10:00:00.000Z';

function createService(permissionOverrides: string[] = ['jobs:view', 'register:view', 'media:view']) {
  const referenceDataService = {
    getLocationDetail: jest.fn().mockResolvedValue({
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
    }),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme',
      accountType: 'company',
      billingAddressLine1: '123 Main',
      billingCity: 'Blaine',
      billingState: 'WA',
      billingPostalCode: '98230',
      isActive: true,
      flags: []
    })
  };
  const equipmentDataService = {
    listEquipmentByLocation: jest.fn().mockResolvedValue([
      {
        id: 'equipment-1',
        locationId: 'location-1',
        equipmentType: 'Condenser',
        brand: 'Carrier',
        model: 'ABC',
        serialNumber: 'SN-1',
        filterSizes: ['16x20x1'],
        installDate: '2020-05-01',
        status: 'active',
        notes: 'Roof',
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ])
  };
  const jobsDataService = {
    getJobDetailById: jest.fn().mockResolvedValue({
      job: {
        id: 'job-1',
        jobNumber: '1001',
        locationId: 'location-1',
        billToCustomerId: 'customer-1',
        jobType: 'Service',
        category: 'General',
        origin: 'Phone',
        summary: 'No cooling',
        status: 'inProgress',
        appointmentIds: ['appointment-1'],
        timeline: [
          {
            id: 'timeline-1',
            occurredAt: timestamp,
            actorName: 'Dispatcher',
            kind: 'jobCreated',
            message: 'Job created.'
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
      },
      appointments: [
        {
          id: 'appointment-1',
          jobId: 'job-1',
          scheduledDate: '2026-05-23',
          scheduledStartTime: '08:00',
          scheduledEndTime: '10:00',
          technicianId: 'tech-1',
          status: 'finished',
          finishedReviewedAt: undefined,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      timelineLimit: 50,
      timelineHasMore: true
    }),
    listRegisterEntriesForJob: jest.fn().mockResolvedValue([
      {
        id: 'register-1',
        jobId: 'job-1',
        kind: 'part',
        description: 'Capacitor',
        quantity: 1,
        totalAmount: 85,
        capturedByEmployeeId: 'tech-1',
        capturedByName: 'Taylor Tech',
        capturedAt: timestamp,
        isVoid: false,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]),
    listMediaAttachmentsForJob: jest.fn().mockResolvedValue([
      {
        id: 'media-1',
        jobId: 'job-1',
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 1024,
        sha256: 'a'.repeat(64),
        originalFilename: 'photo.jpg',
        capturedByEmployeeId: 'tech-1',
        capturedByName: 'Taylor Tech',
        capturedAt: timestamp,
        storagePath: 'job-1/media-1.jpg',
        uploadedAt: timestamp,
        isVoid: false,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ])
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'dispatcher-1',
      displayName: 'Dispatcher',
      roleId: 'dispatcher',
      sessionSurface: 'office-web',
      effectivePermissions: permissionOverrides
    }),
    getActiveEmployees: jest.fn().mockResolvedValue([
      { id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' },
      { id: 'dispatcher-1', displayName: 'Dispatcher', roleId: 'dispatcher' }
    ]),
    getEmployeeSummaryById: jest.fn().mockResolvedValue(null)
  };

  return {
    service: new JobDetailService(
      referenceDataService as never,
      equipmentDataService as never,
      jobsDataService as never,
      identityAccessService as never
    ),
    referenceDataService,
    equipmentDataService,
    jobsDataService,
    identityAccessService
  };
}

describe('JobDetailService', () => {
  it('requires office job view permission and returns a bounded job detail payload', async () => {
    const { service, jobsDataService, equipmentDataService, identityAccessService } = createService();

    const response = await service.getJobDetail('session-token', 'job-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'jobs:view', [
      'office-web'
    ]);
    expect(jobsDataService.getJobDetailById).toHaveBeenCalledWith('job-1', 50);
    expect(jobsDataService.listRegisterEntriesForJob).toHaveBeenCalledWith('job-1', true);
    expect(jobsDataService.listMediaAttachmentsForJob).toHaveBeenCalledWith('job-1', true);
    expect(equipmentDataService.listEquipmentByLocation).toHaveBeenCalledWith('location-1', false);
    expect(response.job).toMatchObject({
      id: 'job-1',
      locationName: 'Main Shop',
      billToCustomerName: 'Acme',
      needsOfficeReview: true,
      appointments: [
        expect.objectContaining({
          id: 'appointment-1',
          technicianName: 'Taylor Tech',
          needsOfficeReview: true
        })
      ]
    });
    expect(response.timelineHasMore).toBe(true);
    expect(response.equipment[0]).toMatchObject({
      id: 'equipment-1',
      locationName: 'Main Shop',
      customerName: 'Acme'
    });
    expect(response.mediaAttachments[0]).toMatchObject({ id: 'media-1', uploadCompleted: true });
  });

  it('does not include register or media rows without those view permissions', async () => {
    const { service, jobsDataService } = createService(['jobs:view']);

    const response = await service.getJobDetail('session-token', 'job-1', '25');

    expect(jobsDataService.getJobDetailById).toHaveBeenCalledWith('job-1', 25);
    expect(jobsDataService.listRegisterEntriesForJob).not.toHaveBeenCalled();
    expect(jobsDataService.listMediaAttachmentsForJob).not.toHaveBeenCalled();
    expect(response.registerEntries).toEqual([]);
    expect(response.mediaAttachments).toEqual([]);
  });

  it('rejects malformed timeline limits', async () => {
    const { service } = createService();

    await expect(service.getJobDetail('session-token', 'job-1', 'abc')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getJobDetail('session-token', 'job-1', '0')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getJobDetail('session-token', 'job-1', '201')).rejects.toBeInstanceOf(BadRequestException);
  });
});
