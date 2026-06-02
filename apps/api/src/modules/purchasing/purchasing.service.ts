import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { ReceivePurchaseOrderRequest } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { PurchasingRepository, type ReceiveLineOverride } from './purchasing.repository';
import type {
  CreatePurchaseOrderRequestDto,
  PurchaseOrderResponseDto,
  PurchaseOrdersResponseDto
} from './purchasing.types';

@Injectable()
export class PurchasingService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly purchasingRepository: PurchasingRepository
  ) {}

  async listPurchaseOrders(sessionToken: string): Promise<PurchaseOrdersResponseDto> {
    await this.authorize(sessionToken, 'purchasing:view');
    return { purchaseOrders: await this.purchasingRepository.listSummaries() };
  }

  async getPurchaseOrder(sessionToken: string, id: string): Promise<PurchaseOrderResponseDto> {
    await this.authorize(sessionToken, 'purchasing:view');
    const purchaseOrder = await this.purchasingRepository.getById(id);
    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found.');
    }
    return { purchaseOrder };
  }

  async createPurchaseOrder(
    sessionToken: string,
    request: CreatePurchaseOrderRequestDto
  ): Promise<PurchaseOrderResponseDto> {
    const actor = await this.authorize(sessionToken, 'purchasing:create');

    // No-split: exactly one destination.
    const hasInventory = Boolean(request.destinationInventoryLocationId);
    const hasCustomer = Boolean(request.destinationCustomerLocationId);
    if (hasInventory === hasCustomer) {
      throw new BadRequestException(
        'A purchase order must end at exactly one destination: an inventory location or a customer location.'
      );
    }
    if (hasInventory) {
      if (
        !(await this.purchasingRepository.inventoryLocationExists(
          request.destinationInventoryLocationId!
        ))
      ) {
        throw new NotFoundException('Destination inventory location not found.');
      }
    } else if (
      !(await this.purchasingRepository.customerLocationExists(
        request.destinationCustomerLocationId!
      ))
    ) {
      throw new NotFoundException('Destination customer location not found.');
    }
    if (request.jobId) {
      const jobLocationId = await this.purchasingRepository.getJobLocationId(request.jobId);
      if (jobLocationId === null) {
        throw new NotFoundException('Job not found.');
      }
      // A customer-destination PO that names a job must agree: the job has to be for that
      // same service location, or receiving would bridge cost/equipment to the wrong place.
      if (hasCustomer && jobLocationId !== request.destinationCustomerLocationId) {
        throw new BadRequestException(
          'The job does not belong to the destination customer location.'
        );
      }
    }
    if (!request.lines || request.lines.length === 0) {
      throw new BadRequestException('A purchase order needs at least one line.');
    }
    for (const line of request.lines) {
      // Each physical serviceable asset gets its own equipment record, so an equipment
      // line is exactly one unit (receiving creates one equipment row from it). Order
      // multiple units as multiple lines.
      if (line.kind === 'equipment') {
        if (line.quantity !== 1) {
          throw new BadRequestException('An equipment line must have a quantity of 1.');
        }
        // Equipment received to a job has its cost applied to that job, which needs a
        // catalog item for the cost movement's provenance.
        if (hasCustomer && request.jobId && !line.itemId) {
          throw new BadRequestException(
            'Equipment on a job purchase order must reference a catalog item.'
          );
        }
      }
      // A catalog-linked line must reference a real item whose kind matches the line kind
      // (a part line can't point at an equipment item, and vice versa).
      if (!line.itemId) {
        continue;
      }
      const itemKind = await this.purchasingRepository.getItemKind(line.itemId);
      if (!itemKind) {
        throw new NotFoundException('A purchase order line references an unknown inventory item.');
      }
      if (itemKind !== line.kind) {
        throw new BadRequestException(
          `Line kind "${line.kind}" does not match the catalog item kind "${itemKind}".`
        );
      }
    }

    const purchaseOrder = await this.purchasingRepository.createPurchaseOrder(request, {
      id: actor.id,
      displayName: actor.displayName
    });
    return { purchaseOrder };
  }

  async orderPurchaseOrder(sessionToken: string, id: string): Promise<PurchaseOrderResponseDto> {
    const actor = await this.authorize(sessionToken, 'purchasing:edit');
    const existing = await this.purchasingRepository.getById(id);
    if (!existing) {
      throw new NotFoundException('Purchase order not found.');
    }
    const ordered = await this.purchasingRepository.markOrdered(id, {
      id: actor.id,
      displayName: actor.displayName
    });
    if (!ordered) {
      throw new ConflictException(
        `Only a draft purchase order can be ordered (status: ${existing.status}).`
      );
    }
    return { purchaseOrder: (await this.purchasingRepository.getById(id))! };
  }

  async receivePurchaseOrder(
    sessionToken: string,
    id: string,
    request: ReceivePurchaseOrderRequest
  ): Promise<PurchaseOrderResponseDto> {
    const actor = await this.authorize(sessionToken, 'purchasing:edit');
    const po = await this.purchasingRepository.getById(id);
    if (!po) {
      throw new NotFoundException('Purchase order not found.');
    }
    // A PO must be ordered before it can be received (create → order → receive).
    if (po.status !== 'ordered') {
      throw new ConflictException(
        `Only an ordered purchase order can be received (status: ${po.status}).`
      );
    }

    // Build + validate per-line overrides against this PO's own lines.
    const lineIds = new Set(po.lines.map((line) => line.id));
    const overrides = new Map<string, ReceiveLineOverride>();
    for (const override of request.lines ?? []) {
      if (!lineIds.has(override.purchaseOrderLineId)) {
        throw new BadRequestException('A receipt line does not belong to this purchase order.');
      }
      if (override.quantity !== undefined && override.quantity <= 0) {
        throw new BadRequestException('Received quantity must be positive.');
      }
      if (override.unitCost !== undefined && override.unitCost < 0) {
        throw new BadRequestException('Received unit cost cannot be negative.');
      }
      overrides.set(override.purchaseOrderLineId, {
        quantity: override.quantity,
        unitCost: override.unitCost,
        serialNumber: override.serialNumber
      });
    }

    // A part that will post a movement (into stock, or to a job) needs a catalog item;
    // an equipment line needs type/brand/model to create the equipment asset.
    const partPostsMovement =
      po.destinationKind === 'inventory' ||
      (po.destinationKind === 'customer' && Boolean(po.jobId));
    for (const line of po.lines) {
      if (line.kind === 'part' && partPostsMovement && !line.itemId) {
        throw new BadRequestException(
          'A part received into stock or to a job must reference a catalog item.'
        );
      }
      if (line.kind === 'equipment') {
        if (!line.equipmentType || !line.equipmentBrand || !line.equipmentModel) {
          throw new BadRequestException(
            'An equipment line needs type, brand, and model to create the equipment record.'
          );
        }
        // One equipment record per physical asset: an equipment line receives one unit.
        const receivedQty = overrides.get(line.id)?.quantity ?? line.quantity;
        if (receivedQty !== 1) {
          throw new BadRequestException('An equipment line must be received as a quantity of 1.');
        }
        // Equipment received to a job applies its cost to the job, which needs a catalog item.
        if (po.destinationKind === 'customer' && po.jobId && !line.itemId) {
          throw new BadRequestException(
            'Equipment received to a job must reference a catalog item so its cost can be applied to the job.'
          );
        }
        // Mirror the equipment-create rule against the EFFECTIVE serial: a serial captured
        // at receiving (override) wins over the PO-line serial; a blank one needs explicit
        // confirmation, since receiving creates the equipment asset record.
        const effectiveSerial =
          overrides.get(line.id)?.serialNumber?.trim() || line.equipmentSerial?.trim();
        if (!effectiveSerial && !request.confirmMissingSerial) {
          throw new ConflictException(
            'Equipment serial number is strongly recommended. Provide it on the receipt line or set confirmMissingSerial.'
          );
        }
      }
    }

    await this.purchasingRepository.receivePurchaseOrder(id, overrides, request.note, {
      id: actor.id,
      displayName: actor.displayName
    });
    return { purchaseOrder: (await this.purchasingRepository.getById(id))! };
  }

  private authorize(
    sessionToken: string,
    permission: 'purchasing:view' | 'purchasing:create' | 'purchasing:edit'
  ) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, permission, [
      'office-web'
    ]);
  }
}
