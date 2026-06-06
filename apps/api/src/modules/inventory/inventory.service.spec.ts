import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
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
    updateLocation: jest.fn(),
    getOnHand: jest.fn().mockResolvedValue([]),
    listTruckStockForEmployee: jest.fn().mockResolvedValue([]),
    recordIssueToJob: jest.fn(),
    getJobStatus: jest.fn().mockResolvedValue('inProgress')
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

describe('InventoryService issueToJob', () => {
  const issueRequest = { itemId: 'item-1', locationId: 'loc-1', jobId: 'job-1', quantity: 3 };

  it('issues stock to a job gated on inventory:edit after validating item, location, and job', async () => {
    const { service, identityAccessService, inventoryRepository } = createService();
    inventoryRepository.getItemById.mockResolvedValue(item());
    inventoryRepository.getLocationById.mockResolvedValue(location());

    await service.issueToJob('token', issueRequest);

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'inventory:edit',
      ['office-web']
    );
    expect(inventoryRepository.getJobStatus).toHaveBeenCalledWith('job-1');
    expect(inventoryRepository.recordIssueToJob).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        locationId: 'loc-1',
        jobId: 'job-1',
        quantity: 3
      })
    );
  });

  it('rejects a non-positive issue quantity and writes nothing', async () => {
    const { service, inventoryRepository } = createService();
    inventoryRepository.getItemById.mockResolvedValue(item());
    inventoryRepository.getLocationById.mockResolvedValue(location());

    await expect(
      service.issueToJob('token', { ...issueRequest, quantity: 0 })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inventoryRepository.recordIssueToJob).not.toHaveBeenCalled();
  });

  it('throws NotFound when the job does not exist', async () => {
    const { service, inventoryRepository } = createService();
    inventoryRepository.getItemById.mockResolvedValue(item());
    inventoryRepository.getLocationById.mockResolvedValue(location());
    inventoryRepository.getJobStatus.mockResolvedValue(null);

    await expect(service.issueToJob('token', issueRequest)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(inventoryRepository.recordIssueToJob).not.toHaveBeenCalled();
  });

  it('rejects issuing to a final job — reopen required', async () => {
    const { service, inventoryRepository } = createService();
    inventoryRepository.getItemById.mockResolvedValue(item());
    inventoryRepository.getLocationById.mockResolvedValue(location());
    inventoryRepository.getJobStatus.mockResolvedValue('completed');

    await expect(service.issueToJob('token', issueRequest)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(inventoryRepository.recordIssueToJob).not.toHaveBeenCalled();
  });
});

describe('InventoryService getFieldTruckStock', () => {
  it('authorizes the field surface on register:create and returns the caller truck stock', async () => {
    const { service, identityAccessService, inventoryRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'tech-7',
      displayName: 'Tia Tech',
      effectivePermissions: ['register:create'],
      sessionSurface: 'field-mobile'
    });
    inventoryRepository.listTruckStockForEmployee.mockResolvedValue([
      {
        itemId: 'item-1',
        itemName: 'Capacitor 45uF',
        locationId: 'truck-7',
        locationName: 'Truck 7',
        quantityOnHand: 4
      }
    ]);

    const result = await service.getFieldTruckStock('token');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'register:create',
      ['field-mobile']
    );
    expect(inventoryRepository.listTruckStockForEmployee).toHaveBeenCalledWith('tech-7');
    expect(result.items).toHaveLength(1);
    expect(result.snapshotVersion).toBe(result.serverTime);
  });

  it('rejects an office session (field surface only)', async () => {
    const { service, identityAccessService, inventoryRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(service.getFieldTruckStock('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(inventoryRepository.listTruckStockForEmployee).not.toHaveBeenCalled();
  });
});
