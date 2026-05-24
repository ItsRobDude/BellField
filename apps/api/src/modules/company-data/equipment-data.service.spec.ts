import { EquipmentDataService } from './equipment-data.service';
import type { EquipmentGroupRecord, EquipmentRecord } from './company-data.types';

function createEquipmentRecord(overrides: Partial<EquipmentRecord> = {}): EquipmentRecord {
  return {
    id: 'equipment-1',
    locationId: 'location-1',
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: '24ABC6',
    serialNumber: 'SN-100',
    filterSizes: ['16x25x1'],
    status: 'active',
    notes: '',
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

function createEquipmentGroup(overrides: Partial<EquipmentGroupRecord> = {}): EquipmentGroupRecord {
  return {
    id: 'group-1',
    name: 'Main HVAC System',
    locationId: 'location-1',
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

function createService() {
  const equipmentDataRepository = {
    getEquipmentById: jest.fn(),
    getEquipmentGroupById: jest.fn().mockResolvedValue(null),
    updateEquipment: jest.fn(),
    linkReplacement: jest.fn(),
    addEquipmentHistoryEntry: jest.fn()
  };
  const databaseService = {
    transaction: jest.fn(async (callback: (queryable: unknown) => Promise<unknown>) => callback({}))
  };

  return {
    service: new EquipmentDataService(equipmentDataRepository as never, databaseService as never),
    equipmentDataRepository,
    databaseService
  };
}

describe('EquipmentDataService', () => {
  it('records pending install to active with office-friendly status labels', async () => {
    const { service, equipmentDataRepository } = createService();
    const previousEquipment = createEquipmentRecord({ status: 'pendingInstall' });
    const nextEquipment = createEquipmentRecord({
      status: 'active',
      updatedAt: '2026-04-14T11:00:00.000Z'
    });

    equipmentDataRepository.getEquipmentById
      .mockResolvedValueOnce(previousEquipment)
      .mockResolvedValueOnce(nextEquipment);
    equipmentDataRepository.updateEquipment.mockResolvedValue(nextEquipment);

    await service.updateEquipment('equipment-1', { status: 'active' }, 'Dispatcher');

    expect(equipmentDataRepository.addEquipmentHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        equipmentId: 'equipment-1',
        actorName: 'Dispatcher',
        kind: 'statusChanged',
        message: 'Status changed from pending install to active.'
      }),
      expect.anything()
    );
  });

  it('records placement changes with readable location or inventory wording', async () => {
    const { service, equipmentDataRepository } = createService();
    const previousEquipment = createEquipmentRecord({
      locationId: 'location-1',
      inventoryLocationLabel: undefined
    });
    const nextEquipment = createEquipmentRecord({
      locationId: undefined,
      inventoryLocationLabel: 'Warehouse A',
      updatedAt: '2026-04-14T11:00:00.000Z'
    });

    equipmentDataRepository.getEquipmentById
      .mockResolvedValueOnce(previousEquipment)
      .mockResolvedValueOnce(nextEquipment);
    equipmentDataRepository.updateEquipment.mockResolvedValue(nextEquipment);

    await service.updateEquipment(
      'equipment-1',
      { inventoryLocationLabel: 'Warehouse A' },
      'Dispatcher'
    );

    expect(equipmentDataRepository.addEquipmentHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'placementChanged',
        message: 'Placement changed to inventory location "Warehouse A".'
      }),
      expect.anything()
    );
  });

  it('records grouping with a readable system group name', async () => {
    const { service, equipmentDataRepository } = createService();
    const systemGroup = createEquipmentGroup();
    const previousEquipment = createEquipmentRecord({ systemGroupId: undefined });
    const nextEquipment = createEquipmentRecord({
      systemGroupId: systemGroup.id,
      updatedAt: '2026-04-14T11:00:00.000Z'
    });

    equipmentDataRepository.getEquipmentById
      .mockResolvedValueOnce(previousEquipment)
      .mockResolvedValueOnce(nextEquipment);
    equipmentDataRepository.getEquipmentGroupById.mockResolvedValue(systemGroup);
    equipmentDataRepository.updateEquipment.mockResolvedValue(nextEquipment);

    await service.updateEquipment(
      'equipment-1',
      { systemGroupName: systemGroup.name },
      'Dispatcher'
    );

    expect(equipmentDataRepository.addEquipmentHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'grouped',
        message: 'Added to system group "Main HVAC System".'
      }),
      expect.anything()
    );
  });

  it('records ungrouping with the previous system group name', async () => {
    const { service, equipmentDataRepository } = createService();
    const systemGroup = createEquipmentGroup();
    const previousEquipment = createEquipmentRecord({ systemGroupId: systemGroup.id });
    const nextEquipment = createEquipmentRecord({
      systemGroupId: undefined,
      updatedAt: '2026-04-14T11:00:00.000Z'
    });

    equipmentDataRepository.getEquipmentById
      .mockResolvedValueOnce(previousEquipment)
      .mockResolvedValueOnce(nextEquipment);
    equipmentDataRepository.getEquipmentGroupById.mockResolvedValueOnce(systemGroup);
    equipmentDataRepository.updateEquipment.mockResolvedValue(nextEquipment);

    await service.updateEquipment('equipment-1', { clearSystemGroup: true }, 'Dispatcher');

    expect(equipmentDataRepository.addEquipmentHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ungrouped',
        message: 'Removed from system group "Main HVAC System".'
      }),
      expect.anything()
    );
  });

  it('records replacement continuity on both old and replacement equipment', async () => {
    const { service, equipmentDataRepository } = createService();
    const oldEquipment = createEquipmentRecord({
      id: 'old-equipment',
      brand: 'Carrier',
      model: '24ABC6',
      serialNumber: 'OLD-100'
    });
    const replacementEquipment = createEquipmentRecord({
      id: 'replacement-equipment',
      brand: 'Trane',
      model: 'XR16',
      serialNumber: 'NEW-200'
    });

    equipmentDataRepository.getEquipmentById
      .mockResolvedValueOnce(oldEquipment)
      .mockResolvedValueOnce(replacementEquipment)
      .mockResolvedValueOnce({
        ...oldEquipment,
        status: 'removed',
        replacedByEquipmentId: replacementEquipment.id
      })
      .mockResolvedValueOnce({
        ...replacementEquipment,
        replacesEquipmentId: oldEquipment.id
      });

    await service.linkReplacement(oldEquipment.id, replacementEquipment.id, 'Dispatcher');

    expect(equipmentDataRepository.updateEquipment).toHaveBeenCalledWith(
      oldEquipment.id,
      { status: 'removed' },
      expect.anything()
    );
    expect(equipmentDataRepository.linkReplacement).toHaveBeenCalledWith(
      replacementEquipment.id,
      oldEquipment.id,
      expect.anything()
    );
    expect(equipmentDataRepository.addEquipmentHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        equipmentId: oldEquipment.id,
        kind: 'markedReplaced',
        message: 'Marked removed and replaced by Trane XR16 (NEW-200).'
      }),
      expect.anything()
    );
    expect(equipmentDataRepository.addEquipmentHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        equipmentId: replacementEquipment.id,
        kind: 'replacementLinkChanged',
        message: 'Linked as the replacement for Carrier 24ABC6 (OLD-100).'
      }),
      expect.anything()
    );
  });
});
