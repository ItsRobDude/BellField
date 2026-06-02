import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import type { PurchaseOrderDto } from './purchasing.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Pat Purchaser',
      effectivePermissions: ['purchasing:view', 'purchasing:create', 'purchasing:edit'],
      sessionSurface: 'office-web'
    })
  };
  const purchasingRepository = {
    listSummaries: jest.fn().mockResolvedValue([]),
    getById: jest.fn(),
    createPurchaseOrder: jest.fn(),
    markOrdered: jest.fn(),
    inventoryLocationExists: jest.fn().mockResolvedValue(true),
    customerLocationExists: jest.fn().mockResolvedValue(true),
    jobExists: jest.fn().mockResolvedValue(true)
  };

  return {
    service: new PurchasingService(identityAccessService as never, purchasingRepository as never),
    identityAccessService,
    purchasingRepository
  };
}

function po(overrides: Partial<PurchaseOrderDto> = {}): PurchaseOrderDto {
  return {
    id: 'po-1',
    vendorName: 'Acme Supply',
    status: 'draft',
    destinationKind: 'inventory',
    destinationId: 'loc-1',
    destinationName: 'Main Warehouse',
    expectedTotalCost: 100,
    lineCount: 1,
    createdByName: 'Pat Purchaser',
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    lines: [],
    ...overrides
  };
}

const validLine = {
  kind: 'part' as const,
  description: 'Capacitor',
  quantity: 2,
  expectedUnitCost: 12.5
};

describe('PurchasingService.createPurchaseOrder', () => {
  it('creates a PO with an inventory destination, gated on purchasing:create', async () => {
    const { service, identityAccessService, purchasingRepository } = createService();
    purchasingRepository.createPurchaseOrder.mockResolvedValue(po());

    const result = await service.createPurchaseOrder('token', {
      vendorName: 'Acme Supply',
      destinationInventoryLocationId: 'loc-1',
      lines: [validLine]
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'purchasing:create',
      ['office-web']
    );
    expect(result.purchaseOrder.destinationKind).toBe('inventory');
  });

  it('rejects a PO with no destination (no-split: exactly one)', async () => {
    const { service, purchasingRepository } = createService();
    await expect(
      service.createPurchaseOrder('token', { vendorName: 'Acme', lines: [validLine] })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects a PO with two destinations (no-split)', async () => {
    const { service, purchasingRepository } = createService();
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationInventoryLocationId: 'loc-1',
        destinationCustomerLocationId: 'cust-loc-1',
        lines: [validLine]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects when the destination location does not exist', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.inventoryLocationExists.mockResolvedValue(false);
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationInventoryLocationId: 'missing',
        lines: [validLine]
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PurchasingService.orderPurchaseOrder', () => {
  it('transitions a draft to ordered', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById
      .mockResolvedValueOnce(po())
      .mockResolvedValueOnce(po({ status: 'ordered' }));
    purchasingRepository.markOrdered.mockResolvedValue(true);

    const result = await service.orderPurchaseOrder('token', 'po-1');

    expect(result.purchaseOrder.status).toBe('ordered');
  });

  it('409s when the PO is not a draft', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(po({ status: 'ordered' }));
    purchasingRepository.markOrdered.mockResolvedValue(false);

    await expect(service.orderPurchaseOrder('token', 'po-1')).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});
