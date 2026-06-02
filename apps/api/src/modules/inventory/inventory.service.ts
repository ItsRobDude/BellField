import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateInventoryAdjustmentRequest,
  CreateInventoryIssueRequest,
  CreateInventoryTransferRequest,
  InventoryMovementResponse,
  InventoryOnHandResponse
} from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { InventoryRepository } from './inventory.repository';
import type {
  CreateInventoryItemRequestDto,
  CreateInventoryLocationRequestDto,
  InventoryItemResponseDto,
  InventoryItemsResponseDto,
  InventoryLocationResponseDto,
  InventoryLocationsResponseDto,
  UpdateInventoryItemRequestDto,
  UpdateInventoryLocationRequestDto
} from './inventory.types';

@Injectable()
export class InventoryService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly inventoryRepository: InventoryRepository
  ) {}

  // --- Items ---------------------------------------------------------------

  async listItems(sessionToken: string): Promise<InventoryItemsResponseDto> {
    await this.authorize(sessionToken, 'inventory:view');
    return { items: await this.inventoryRepository.listItems() };
  }

  async createItem(
    sessionToken: string,
    request: CreateInventoryItemRequestDto
  ): Promise<InventoryItemResponseDto> {
    await this.authorize(sessionToken, 'inventory:create');
    return { item: await this.inventoryRepository.createItem(request) };
  }

  async updateItem(
    sessionToken: string,
    itemId: string,
    request: UpdateInventoryItemRequestDto
  ): Promise<InventoryItemResponseDto> {
    await this.authorize(sessionToken, 'inventory:edit');
    const existing = await this.inventoryRepository.getItemById(itemId);
    if (!existing) {
      throw new NotFoundException('Inventory item not found.');
    }
    await this.inventoryRepository.updateItem(itemId, request);
    return { item: (await this.inventoryRepository.getItemById(itemId))! };
  }

  // --- Locations -----------------------------------------------------------

  async listLocations(sessionToken: string): Promise<InventoryLocationsResponseDto> {
    await this.authorize(sessionToken, 'inventory:view');
    return { locations: await this.inventoryRepository.listLocations() };
  }

  async createLocation(
    sessionToken: string,
    request: CreateInventoryLocationRequestDto
  ): Promise<InventoryLocationResponseDto> {
    await this.authorize(sessionToken, 'inventory:create');
    return { location: await this.inventoryRepository.createLocation(request) };
  }

  async updateLocation(
    sessionToken: string,
    locationId: string,
    request: UpdateInventoryLocationRequestDto
  ): Promise<InventoryLocationResponseDto> {
    await this.authorize(sessionToken, 'inventory:edit');
    const existing = await this.inventoryRepository.getLocationById(locationId);
    if (!existing) {
      throw new NotFoundException('Inventory location not found.');
    }
    await this.inventoryRepository.updateLocation(locationId, request);
    return { location: (await this.inventoryRepository.getLocationById(locationId))! };
  }

  // --- Ledger (on-hand, adjustments, transfers) ----------------------------

  async getOnHand(sessionToken: string): Promise<InventoryOnHandResponse> {
    await this.authorize(sessionToken, 'inventory:view');
    return { rows: await this.inventoryRepository.getOnHand() };
  }

  /** The immutable movement ledger, optionally filtered to one item or job (newest first). */
  async listMovements(
    sessionToken: string,
    filter: { itemId?: string; jobId?: string }
  ): Promise<InventoryMovementResponse> {
    await this.authorize(sessionToken, 'inventory:view');
    return { movements: await this.inventoryRepository.listMovements(filter, 200) };
  }

  async createAdjustment(
    sessionToken: string,
    request: CreateInventoryAdjustmentRequest
  ): Promise<InventoryOnHandResponse> {
    const actor = await this.authorize(sessionToken, 'inventory:edit');
    if (request.quantityDelta === 0) {
      throw new BadRequestException('Adjustment quantity must be non-zero.');
    }
    await this.requireItem(request.itemId);
    await this.requireLocation(request.locationId);

    await this.inventoryRepository.recordAdjustment({
      itemId: request.itemId,
      locationId: request.locationId,
      quantityDelta: request.quantityDelta,
      unitCost: request.unitCost,
      note: request.note,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { rows: await this.inventoryRepository.getOnHand() };
  }

  async createTransfer(
    sessionToken: string,
    request: CreateInventoryTransferRequest
  ): Promise<InventoryOnHandResponse> {
    const actor = await this.authorize(sessionToken, 'inventory:edit');
    if (request.fromLocationId === request.toLocationId) {
      throw new BadRequestException('Transfer source and destination must differ.');
    }
    await this.requireItem(request.itemId);
    await this.requireLocation(request.fromLocationId);
    await this.requireLocation(request.toLocationId);

    await this.inventoryRepository.recordTransfer({
      itemId: request.itemId,
      fromLocationId: request.fromLocationId,
      toLocationId: request.toLocationId,
      quantity: request.quantity,
      note: request.note,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { rows: await this.inventoryRepository.getOnHand() };
  }

  /** Issue stock from a location to a job; its value flows to the job's cost (B6 rollup). */
  async issueToJob(
    sessionToken: string,
    request: CreateInventoryIssueRequest
  ): Promise<InventoryOnHandResponse> {
    const actor = await this.authorize(sessionToken, 'inventory:edit');
    if (request.quantity <= 0) {
      throw new BadRequestException('Issue quantity must be positive.');
    }
    await this.requireItem(request.itemId);
    await this.requireLocation(request.locationId);
    await this.requireJob(request.jobId);

    await this.inventoryRepository.recordIssueToJob({
      itemId: request.itemId,
      locationId: request.locationId,
      jobId: request.jobId,
      quantity: request.quantity,
      note: request.note,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { rows: await this.inventoryRepository.getOnHand() };
  }

  private async requireItem(itemId: string) {
    if (!(await this.inventoryRepository.getItemById(itemId))) {
      throw new NotFoundException('Inventory item not found.');
    }
  }

  private async requireLocation(locationId: string) {
    if (!(await this.inventoryRepository.getLocationById(locationId))) {
      throw new NotFoundException('Inventory location not found.');
    }
  }

  private async requireJob(jobId: string) {
    if (!(await this.inventoryRepository.jobExists(jobId))) {
      throw new NotFoundException('Job not found.');
    }
  }

  /** Inventory is an office-only function this milestone, like the rest of operations. */
  private authorize(
    sessionToken: string,
    permission: 'inventory:view' | 'inventory:create' | 'inventory:edit'
  ) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, permission, [
      'office-web'
    ]);
  }
}
