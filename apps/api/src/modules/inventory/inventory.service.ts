import { Injectable, NotFoundException } from '@nestjs/common';
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
