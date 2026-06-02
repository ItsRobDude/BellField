import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import type { InventoryItemRecord, InventoryLocationRecord } from './inventory.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Ivy Inventory',
      effectivePermissions: ['inventory:view', 'inventory:create', 'inventory:edit'],
      sessionSurface: 'office-web'
    })
  };
  const inventoryRepository = {
    listItems: jest.fn().mockResolvedValue([]),
    getItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    listLocations: jest.fn().mockResolvedValue([]),
    getLocationById: jest.fn(),
    createLocation: jest.fn(),
    updateLocation: jest.fn()
  };

  return {
    service: new InventoryService(identityAccessService as never, inventoryRepository as never),
    identityAccessService,
    inventoryRepository
  };
}

function item(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: 'item-1',
    name: 'Capacitor 45/5',
    kind: 'part',
    isActive: true,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides
  };
}

function location(overrides: Partial<InventoryLocationRecord> = {}): InventoryLocationRecord {
  return {
    id: 'loc-1',
    name: 'Main Warehouse',
    kind: 'warehouse',
    isActive: true,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides
  };
}

describe('InventoryService items', () => {
  it('creates an item gated office-only on inventory:create', async () => {
    const { service, identityAccessService, inventoryRepository } = createService();
    inventoryRepository.createItem.mockResolvedValue(item());

    const result = await service.createItem('token', { name: 'Capacitor 45/5', kind: 'part' });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'inventory:create',
      ['office-web']
    );
    expect(result.item.kind).toBe('part');
  });

  it('lists items gated on inventory:view', async () => {
    const { service, identityAccessService, inventoryRepository } = createService();
    inventoryRepository.listItems.mockResolvedValue([
      item(),
      item({ id: 'item-2', kind: 'equipment' })
    ]);

    const result = await service.listItems('token');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'inventory:view',
      ['office-web']
    );
    expect(result.items).toHaveLength(2);
  });

  it('throws NotFound updating a missing item', async () => {
    const { service, inventoryRepository } = createService();
    inventoryRepository.getItemById.mockResolvedValue(null);

    await expect(
      service.updateItem('token', 'missing', { name: 'x', kind: 'part', isActive: true })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(inventoryRepository.updateItem).not.toHaveBeenCalled();
  });

  it('propagates a forbidden session and writes nothing', async () => {
    const { service, identityAccessService, inventoryRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(service.createItem('token', { name: 'x', kind: 'part' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(inventoryRepository.createItem).not.toHaveBeenCalled();
  });
});

describe('InventoryService locations', () => {
  it('creates a location gated on inventory:create', async () => {
    const { service, inventoryRepository } = createService();
    inventoryRepository.createLocation.mockResolvedValue(location({ kind: 'truck' }));

    const result = await service.createLocation('token', { name: 'Truck 1', kind: 'truck' });

    expect(result.location.kind).toBe('truck');
  });

  it('throws NotFound updating a missing location', async () => {
    const { service, inventoryRepository } = createService();
    inventoryRepository.getLocationById.mockResolvedValue(null);

    await expect(
      service.updateLocation('token', 'missing', { name: 'x', kind: 'warehouse', isActive: true })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(inventoryRepository.updateLocation).not.toHaveBeenCalled();
  });
});
