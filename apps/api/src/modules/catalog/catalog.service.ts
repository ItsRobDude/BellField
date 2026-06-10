import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FieldCatalogResponse,
  FieldCatalogItem,
  CatalogItem,
  CatalogItemsResponse,
  CatalogItemResponse,
  CatalogCategoriesResponse,
  CatalogCategoryResponse
} from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { CatalogRepository } from './catalog.repository';
import type {
  CreateCatalogCategoryRequestDto,
  CreateCatalogItemRequestDto,
  UpdateCatalogCategoryRequestDto,
  UpdateCatalogItemRequestDto
} from './catalog.types';

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
    const actor = await this.authorize(sessionToken, 'catalog:view');
    const items = await this.catalogRepository.listItems();
    const canViewInternalCatalogFields = actor.effectivePermissions.includes('catalog:edit');
    return {
      items: canViewInternalCatalogFields ? items : items.map(toReadOnlyCatalogItem)
    };
  }

  async listCategories(sessionToken: string): Promise<CatalogCategoriesResponse> {
    await this.authorize(sessionToken, 'catalog:view');
    return { categories: await this.catalogRepository.listCategories() };
  }

  async createCategory(
    sessionToken: string,
    request: CreateCatalogCategoryRequestDto
  ): Promise<CatalogCategoryResponse> {
    await this.authorize(sessionToken, 'catalog:create');
    await this.validateCatalogCategoryRequest(request);
    try {
      return { category: await this.catalogRepository.createCategory(request) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException('Catalog category name already exists.');
      }
      throw error;
    }
  }

  async updateCategory(
    sessionToken: string,
    categoryId: string,
    request: UpdateCatalogCategoryRequestDto
  ): Promise<CatalogCategoryResponse> {
    await this.authorize(sessionToken, 'catalog:edit');
    const existing = await this.catalogRepository.getCategoryById(categoryId);
    if (!existing) {
      throw new NotFoundException('Catalog category not found.');
    }
    await this.validateCatalogCategoryRequest(request, categoryId);
    try {
      await this.catalogRepository.updateCategory(categoryId, request, existing.name);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException('Catalog category name already exists.');
      }
      throw error;
    }
    return { category: (await this.catalogRepository.getCategoryById(categoryId))! };
  }

  async createItem(
    sessionToken: string,
    request: CreateCatalogItemRequestDto
  ): Promise<CatalogItemResponse> {
    await this.authorize(sessionToken, 'catalog:create');
    const normalizedRequest = await this.applyCategoryTaxDefault(request);
    await this.validateCatalogItemRequest(normalizedRequest);
    return { item: await this.catalogRepository.createItem(normalizedRequest) };
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

  private async applyCategoryTaxDefault(
    request: CreateCatalogItemRequestDto
  ): Promise<CreateCatalogItemRequestDto> {
    if (request.taxableDefault !== undefined) {
      return request;
    }
    const categoryName = request.category?.trim();
    if (!categoryName) {
      return request;
    }

    // Archived categories keep their meaning: archiving governs visibility in
    // pickers, not what the category says about taxability.
    const category = await this.catalogRepository.getCategoryByName(categoryName);
    if (!category || category.defaultTaxable === undefined) {
      return request;
    }

    return { ...request, taxableDefault: category.defaultTaxable };
  }

  private async validateCatalogCategoryRequest(
    request: CreateCatalogCategoryRequestDto | UpdateCatalogCategoryRequestDto,
    existingCategoryId?: string
  ) {
    const name = request.name.trim();
    if (!name) {
      throw new BadRequestException('Catalog category name is required.');
    }

    // The estimate picker uses "Uncategorized" as its bucket for items with no
    // category; a real category with that name would silently alias it.
    if (name.toLocaleLowerCase() === 'uncategorized') {
      throw new BadRequestException(
        '"Uncategorized" is reserved for items without a category. Choose another name.'
      );
    }

    if (request.sortOrder !== undefined) {
      if (
        !Number.isInteger(request.sortOrder) ||
        request.sortOrder < -100000 ||
        request.sortOrder > 100000
      ) {
        throw new BadRequestException('Catalog category sort order is outside the allowed range.');
      }
    }

    if (await this.catalogRepository.categoryNameExists(name, existingCategoryId)) {
      throw new BadRequestException('Catalog category name already exists.');
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

function toReadOnlyCatalogItem(item: CatalogItem): CatalogItem {
  const readOnlyItem = { ...item };
  delete readOnlyItem.internalNotes;
  delete readOnlyItem.costHint;
  delete readOnlyItem.incomeCategory;
  delete readOnlyItem.accountingExportCode;
  return readOnlyItem;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
