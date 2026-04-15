import { EquipmentService } from './equipment.service';

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
      contactIds: []
    }),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme'
    }),
    listLocations: jest.fn().mockResolvedValue([])
  };
  const equipmentDataService = {
    getEquipmentById: jest.fn(),
    updateEquipment: jest.fn(),
    listEquipment: jest.fn().mockResolvedValue([])
  };
  const jobsDataService = {
    listAssignedJobsForEmployee: jest.fn().mockResolvedValue([])
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn()
  };

  return {
    service: new EquipmentService(
      referenceDataService as never,
      equipmentDataService as never,
      jobsDataService as never,
      identityAccessService as never
    ),
    equipmentDataService,
    identityAccessService
  };
}

describe('EquipmentService', () => {
  it('rejects out-of-scope field equipment updates without replay provenance', async () => {
    const { service, equipmentDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['equipment:edit'],
      sessionSurface: 'field-mobile'
    });
    equipmentDataService.getEquipmentById.mockResolvedValue({
      id: 'equipment-1',
      locationId: 'location-2',
      equipmentType: 'furnace',
      brand: 'Carrier',
      model: 'ABC',
      serialNumber: '123',
      filterSizes: [],
      status: 'active',
      notes: '',
      createdAt: '2026-04-14T09:00:00.000Z',
      updatedAt: '2026-04-14T10:00:00.000Z'
    });

    const response = await service.updateEquipment('session-token', 'equipment-1', {
      status: 'inactive',
      occurredAt: '2026-04-14T11:00:00.000Z'
    });

    expect(response.syncResult).toEqual({
      status: 'rejected',
      message:
        'This equipment change is outside the current assigned-work scope and could not be validated as an offline replay.'
    });
    expect(equipmentDataService.updateEquipment).not.toHaveBeenCalled();
  });

  it('preserves offline field equipment updates after reassignment when replay provenance is present', async () => {
    const { service, equipmentDataService, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['equipment:edit'],
      sessionSurface: 'field-mobile'
    });
    equipmentDataService.getEquipmentById.mockResolvedValue({
      id: 'equipment-1',
      locationId: 'location-2',
      equipmentType: 'furnace',
      brand: 'Carrier',
      model: 'ABC',
      serialNumber: '123',
      filterSizes: [],
      status: 'active',
      notes: '',
      createdAt: '2026-04-14T09:00:00.000Z',
      updatedAt: '2026-04-14T10:00:00.000Z'
    });
    equipmentDataService.updateEquipment.mockResolvedValue({
      id: 'equipment-1',
      locationId: 'location-2',
      equipmentType: 'furnace',
      brand: 'Carrier',
      model: 'ABC',
      serialNumber: '123',
      filterSizes: [],
      status: 'inactive',
      notes: '',
      createdAt: '2026-04-14T09:00:00.000Z',
      updatedAt: '2026-04-14T12:00:00.000Z'
    });

    const response = await service.updateEquipment('session-token', 'equipment-1', {
      status: 'inactive',
      occurredAt: '2026-04-14T11:00:00.000Z',
      baseUpdatedAt: '2026-04-14T10:00:00.000Z',
      syncSource: 'field-save-queue'
    });

    expect(response.syncResult).toEqual({
      status: 'applied',
      message: 'Equipment update synced after assignment changed while the device was offline.'
    });
  });
});
