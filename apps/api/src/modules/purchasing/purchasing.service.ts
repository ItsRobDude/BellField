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
    // A catalog-linked line must reference a real item whose kind matches the line kind
    // (a part line can't point at an equipment item, and vice versa) — this matters for
    // the receiving/equipment bridge in the next slice.
    for (const line of request.lines) {
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
    if (po.status === 'received' || po.status === 'closed') {
      throw new ConflictException(`Purchase order is already ${po.status}.`);
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
        unitCost: override.unitCost
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
      if (
        line.kind === 'equipment' &&
        (!line.equipmentType || !line.equipmentBrand || !line.equipmentModel)
      ) {
        throw new BadRequestException(
          'An equipment line needs type, brand, and model to create the equipment record.'
        );
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
