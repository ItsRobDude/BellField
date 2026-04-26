import { ForbiddenException } from '@nestjs/common';
import { EquipmentService } from './equipment.service';

function createEquipmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'equipment-1',
    locationId: 'location-2',
    inventoryLocationLabel: undefined,
    equipmentType: 'Gas Furnace',
    brand: 'Carrier',
    model: 'ABC',
    serialNumber: '123',
    filterSizes: [],
    equipmentLocationDescription: undefined,
    installDate: '2020-01-01',
    warrantyStartDate: undefined,
    warrantyEndDate: undefined,
    warrantyProviderNote: undefined,
    systemGroupId: undefined,
    replacesEquipmentId: undefined,
    replacedByEquipmentId: undefined,
    status: 'active',
    notes: '',
    createdAt: '2026-04-14T09:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

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
      contacts: []
    }),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme'
    }),
    getLocationDetail: jest.fn().mockResolvedValue({
      id: 'location-2',
      name: 'Main Shop',
      customerId: 'customer-1',
      customerName: 'Acme',
      addressLine1: '123 Main',
      city: 'Blaine',
      state: 'WA',
      postalCode: '98230',
      contacts: [],
      alternateBillToCustomerIds: []
    }),
    listLocations: jest.fn().mockResolvedValue([])
  };
  const equipmentDataService = {
    getEquipmentById: jest.fn().mockResolvedValue(createEquipmentRecord()),
    updateEquipment: jest.fn().mockResolvedValue(createEquipmentRecord({ status: 'inactive', updatedAt: '2026-04-14T12:00:00.000Z' })),
    listEquipment: jest.fn().mockResolvedValue([]),
    getEquipmentHistory: jest.fn().mockResolvedValue([]),
    getEquipmentGroupById: jest.fn().mockResolvedValue(null),
    listEquipmentByIds: jest.fn().mockResolvedValue([]),
    linkReplacement: jest.fn().mockResolvedValue({
      oldEquipment: createEquipmentRecord({ status: 'removed', replacedByEquipmentId: 'equipment-2' }),
      replacementEquipment: createEquipmentRecord({
        id: 'equipment-2',
        model: 'XYZ',
        replacesEquipmentId: 'equipment-1'
      })
    })
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
    expect(equipmentDataService.updateEquipment).toHaveBeenCalled();
  });

  it('requires equipment configure permission before linking a replacement', async () => {
    const { service, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-1',
      displayName: 'Field Tech',
      effectivePermissions: ['equipment:edit'],
      sessionSurface: 'office-web'
    });

    await expect(
      service.linkEquipmentReplacement('session-token', 'equipment-1', {
        replacementEquipmentId: 'equipment-2'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
