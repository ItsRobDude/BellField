import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FieldCatalogResponse,
  FieldCatalogItem,
  CatalogItemsResponse,
  CatalogItemResponse
} from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { CatalogRepository } from './catalog.repository';
import type { CreateCatalogItemRequestDto, UpdateCatalogItemRequestDto } from './catalog.types';

@Injectable()
export class CatalogService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly catalogRepository: CatalogRepository
  ) {}

  async getFieldCatalog(sessionToken: string): Promise<FieldCatalogResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'register:create', [
      'field-mobile'
    ]);
    const serverTime = new Date().toISOString();

    return {
      items: await this.listFieldCatalogItems(),
      serverTime,
      snapshotVersion: serverTime
    };
  }

  async listFieldCatalogItems(): Promise<FieldCatalogItem[]> {
    return this.catalogRepository.listFieldItems();
  }

  async listItems(sessionToken: string): Promise<CatalogItemsResponse> {
    await this.authorize(sessionToken, 'catalog:view');
    return { items: await this.catalogRepository.listItems() };
  }

  async createItem(
    sessionToken: string,
    request: CreateCatalogItemRequestDto
  ): Promise<CatalogItemResponse> {
    await this.authorize(sessionToken, 'catalog:create');
    await this.validateCatalogItemRequest(request);
    return { item: await this.catalogRepository.createItem(request) };
  }

  async updateItem(
    sessionToken: string,
    itemId: string,
    request: UpdateCatalogItemRequestDto
  ): Promise<CatalogItemResponse> {
    await this.authorize(sessionToken, 'catalog:edit');
    const existing = await this.catalogRepository.getItemById(itemId);
    if (!existing) {
      throw new NotFoundException('Catalog item not found.');
    }
    await this.validateCatalogItemRequest(request);
    await this.catalogRepository.updateItem(itemId, request);
    return { item: (await this.catalogRepository.getItemById(itemId))! };
  }

  private async validateCatalogItemRequest(
    request: CreateCatalogItemRequestDto | UpdateCatalogItemRequestDto
  ) {
    if (!request.name.trim()) {
      throw new BadRequestException('Catalog item name is required.');
    }

    if (request.defaultSalePrice !== undefined) {
      if (request.kind === 'discount' && request.defaultSalePrice > 0) {
        throw new BadRequestException('Discount catalog items cannot have a positive price.');
      }
      if (request.kind !== 'discount' && request.defaultSalePrice < 0) {
        throw new BadRequestException('Only discount catalog items can have a negative price.');
      }
    }

    const linkedInventoryItemId = request.linkedInventoryItemId?.trim();
    if (
      linkedInventoryItemId &&
      !(await this.catalogRepository.inventoryItemExists(linkedInventoryItemId))
    ) {
      throw new NotFoundException('Linked inventory item not found.');
    }
  }

  private authorize(
    sessionToken: string,
    permission: 'catalog:view' | 'catalog:create' | 'catalog:edit'
  ) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, permission, [
      'office-web'
    ]);
  }
}
