import { BadRequestException } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

function createService() {
  const jobsDataService = {
    listDispatchAppointments: jest.fn().mockResolvedValue([])
  };
  const equipmentDataService = {
    listEquipmentByLocations: jest.fn().mockResolvedValue([])
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'dispatcher-1',
      displayName: 'Dispatcher',
      sessionSurface: 'office-web',
      effectivePermissions: ['appointmentsDispatch:view']
    }),
    getActiveEmployees: jest.fn().mockResolvedValue([
      { id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' },
      { id: 'dispatcher-1', displayName: 'Dispatcher', roleId: 'dispatcher' }
    ])
  };

  return {
    service: new DispatchService(
      jobsDataService as never,
      equipmentDataService as never,
      identityAccessService as never
    ),
    jobsDataService,
    equipmentDataService,
    identityAccessService
  };
}

describe('DispatchService', () => {
  it('requires office dispatch view permission and returns compact dated appointments', async () => {
    const { service, jobsDataService, equipmentDataService, identityAccessService } = createService();
    jobsDataService.listDispatchAppointments.mockResolvedValueOnce([
      {
        appointmentId: 'appointment-1',
        jobId: 'job-1',
        jobNumber: '1001',
        jobSummary: 'No cooling',
        jobStatus: 'scheduled',
        jobType: 'Service',
        status: 'scheduled',
        scheduledDate: '2026-05-23',
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
        needsOfficeReview: false
      }
    ]);
    equipmentDataService.listEquipmentByLocations.mockResolvedValueOnce([
      {
        id: 'equipment-1',
        locationId: 'location-1',
        equipmentType: 'Condenser',
        brand: 'Carrier',
        model: 'ABC',
        serialNumber: 'SN-1',
        filterSizes: ['16x20x1'],
        installDate: '2021-06-01',
        status: 'active',
        notes: '',
        createdAt: '2026-05-20T10:00:00.000Z',
        updatedAt: '2026-05-20T10:00:00.000Z'
      }
    ]);

    const response = await service.getDispatchBoard('session-token', '2026-05-23', '2026-05-23');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'appointmentsDispatch:view',
      ['office-web']
    );
    expect(jobsDataService.listDispatchAppointments).toHaveBeenCalledWith('2026-05-23', '2026-05-23');
    expect(equipmentDataService.listEquipmentByLocations).toHaveBeenCalledWith(['location-1'], false);
    expect(response.technicians).toEqual([{ id: 'tech-1', displayName: 'Taylor Tech', roleId: 'technician' }]);
    expect(response.appointments[0]).toMatchObject({
      appointmentId: 'appointment-1',
      jobNumber: '1001',
      equipmentCount: 1,
      equipment: [
        {
          id: 'equipment-1',
          equipmentType: 'Condenser',
          brand: 'Carrier',
          model: 'ABC',
          serialNumber: 'SN-1',
          filterSizes: ['16x20x1'],
          installDate: '2021-06-01',
          status: 'active'
        }
      ]
    });
  });

  it('rejects malformed and over-broad date windows', async () => {
    const { service } = createService();

    await expect(service.getDispatchBoard('session-token', '2026-02-31', '2026-03-01')).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.getDispatchBoard('session-token', '2026-05-23', '2026-05-22')).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.getDispatchBoard('session-token', '2026-05-01', '2026-06-01')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('caps equipment glance rows while preserving equipment count', async () => {
    const { service, jobsDataService, equipmentDataService } = createService();
    jobsDataService.listDispatchAppointments.mockResolvedValueOnce([
      {
        appointmentId: 'appointment-1',
        jobId: 'job-1',
        jobNumber: '1001',
        jobSummary: 'No cooling',
        jobStatus: 'scheduled',
        jobType: 'Service',
        status: 'scheduled',
        scheduledDate: '2026-05-23',
        locationId: 'location-1',
        locationName: 'Main Shop',
        locationAddressLine1: '123 Main',
        locationCity: 'Blaine',
        locationState: 'WA',
        billToCustomerId: 'customer-1',
        billToCustomerName: 'Acme',
        customerName: 'Acme',
        needsOfficeReview: false
      }
    ]);
    equipmentDataService.listEquipmentByLocations.mockResolvedValueOnce(
      [1, 2, 3, 4].map((index) => ({
        id: `equipment-${index}`,
        locationId: 'location-1',
        equipmentType: 'Condenser',
        brand: 'Carrier',
        model: `ABC-${index}`,
        serialNumber: `SN-${index}`,
        filterSizes: [],
        status: 'active',
        notes: '',
        createdAt: '2026-05-20T10:00:00.000Z',
        updatedAt: '2026-05-20T10:00:00.000Z'
      }))
    );

    const response = await service.getDispatchBoard('session-token', '2026-05-23', undefined);

    expect(response.endDate).toBe('2026-05-23');
    expect(response.appointments[0]?.equipmentCount).toBe(4);
    expect(response.appointments[0]?.equipment.map((equipment) => equipment.id)).toEqual([
      'equipment-1',
      'equipment-2',
      'equipment-3'
    ]);
  });
});
