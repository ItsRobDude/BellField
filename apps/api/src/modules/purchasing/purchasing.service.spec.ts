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
    receivePurchaseOrder: jest.fn(),
    inventoryLocationExists: jest.fn().mockResolvedValue(true),
    customerLocationExists: jest.fn().mockResolvedValue(true),
    jobExists: jest.fn().mockResolvedValue(true),
    getJobLocationId: jest.fn().mockResolvedValue('cust-loc-1'),
    getItemKind: jest.fn().mockResolvedValue('part')
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

  it('rejects a line whose kind does not match the catalog item kind', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getItemKind.mockResolvedValue('equipment');
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationInventoryLocationId: 'loc-1',
        lines: [{ ...validLine, itemId: 'eq-item', kind: 'part' }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects a line referencing an unknown catalog item', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getItemKind.mockResolvedValue(null);
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationInventoryLocationId: 'loc-1',
        lines: [{ ...validLine, itemId: 'ghost' }]
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a customer-destination PO whose job belongs to a different location', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getJobLocationId.mockResolvedValue('other-location');
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationCustomerLocationId: 'cust-loc-1',
        jobId: 'job-1',
        lines: [validLine]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects equipment on a job purchase order without a catalog item', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getJobLocationId.mockResolvedValue('cust-loc-1');
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationCustomerLocationId: 'cust-loc-1',
        jobId: 'job-1',
        lines: [
          {
            kind: 'equipment',
            description: 'Furnace',
            quantity: 1,
            expectedUnitCost: 2000,
            equipmentType: 'Furnace',
            equipmentBrand: 'Carrier',
            equipmentModel: '59TP6'
          }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects an equipment line with quantity other than 1 (one asset per record)', async () => {
    const { service, purchasingRepository } = createService();
    await expect(
      service.createPurchaseOrder('token', {
        vendorName: 'Acme',
        destinationInventoryLocationId: 'loc-1',
        lines: [
          {
            kind: 'equipment',
            description: 'Condenser',
            quantity: 3,
            expectedUnitCost: 1400,
            equipmentType: 'Condenser',
            equipmentBrand: 'Trane',
            equipmentModel: 'XR14'
          }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('accepts a customer-destination PO whose job matches the destination location', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getJobLocationId.mockResolvedValue('cust-loc-1');
    purchasingRepository.createPurchaseOrder.mockResolvedValue(
      po({ destinationKind: 'customer', destinationId: 'cust-loc-1' })
    );
    const result = await service.createPurchaseOrder('token', {
      vendorName: 'Acme',
      destinationCustomerLocationId: 'cust-loc-1',
      jobId: 'job-1',
      lines: [validLine]
    });
    expect(result.purchaseOrder.destinationKind).toBe('customer');
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

function poLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    position: 0,
    kind: 'part' as const,
    description: 'Capacitor',
    quantity: 2,
    expectedUnitCost: 12.5,
    expectedLineCost: 25,
    ...overrides
  };
}

describe('PurchasingService.receivePurchaseOrder', () => {
  it('receives an ordered PO and re-reads it, gated on purchasing:edit', async () => {
    const { service, identityAccessService, purchasingRepository } = createService();
    const ordered = po({
      status: 'ordered',
      lines: [poLine({ itemId: 'item-1' })]
    });
    purchasingRepository.getById
      .mockResolvedValueOnce(ordered)
      .mockResolvedValueOnce(po({ status: 'received', lines: [poLine({ itemId: 'item-1' })] }));

    const result = await service.receivePurchaseOrder('token', 'po-1', {});

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'purchasing:edit',
      ['office-web']
    );
    expect(purchasingRepository.receivePurchaseOrder).toHaveBeenCalled();
    expect(result.purchaseOrder.status).toBe('received');
  });

  it('409s when the PO is already received', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(po({ status: 'received' }));

    await expect(service.receivePurchaseOrder('token', 'po-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(purchasingRepository.receivePurchaseOrder).not.toHaveBeenCalled();
  });

  it('409s when receiving a draft PO that was never ordered', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(
      po({ status: 'draft', lines: [poLine({ itemId: 'item-1' })] })
    );

    await expect(service.receivePurchaseOrder('token', 'po-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(purchasingRepository.receivePurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects receiving equipment to a job without a catalog item (cost cannot post)', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(
      po({
        status: 'ordered',
        destinationKind: 'customer',
        jobId: 'job-1',
        lines: [
          poLine({
            kind: 'equipment',
            equipmentType: 'Furnace',
            equipmentBrand: 'Carrier',
            equipmentModel: '59TP6',
            quantity: 1
          })
        ]
      })
    );

    await expect(service.receivePurchaseOrder('token', 'po-1', {})).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(purchasingRepository.receivePurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects receiving an equipment line at a quantity other than 1', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(
      po({
        status: 'ordered',
        destinationKind: 'inventory',
        lines: [
          poLine({
            kind: 'equipment',
            equipmentType: 'Condenser',
            equipmentBrand: 'Trane',
            equipmentModel: 'XR14',
            quantity: 1
          })
        ]
      })
    );

    await expect(
      service.receivePurchaseOrder('token', 'po-1', {
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 2 }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchasingRepository.receivePurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects a part received into stock without a catalog item', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(
      po({
        status: 'ordered',
        destinationKind: 'inventory',
        lines: [poLine({ itemId: undefined })]
      })
    );

    await expect(service.receivePurchaseOrder('token', 'po-1', {})).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(purchasingRepository.receivePurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects an equipment line missing type/brand/model', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(
      po({
        status: 'ordered',
        destinationKind: 'customer',
        lines: [poLine({ kind: 'equipment', equipmentType: 'Condenser' })]
      })
    );

    await expect(service.receivePurchaseOrder('token', 'po-1', {})).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects an override line that is not on the PO', async () => {
    const { service, purchasingRepository } = createService();
    purchasingRepository.getById.mockResolvedValue(
      po({ status: 'ordered', destinationKind: 'inventory', lines: [poLine({ itemId: 'item-1' })] })
    );

    await expect(
      service.receivePurchaseOrder('token', 'po-1', {
        lines: [{ purchaseOrderLineId: 'ghost', quantity: 1 }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
