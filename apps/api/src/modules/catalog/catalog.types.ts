import type {
  CatalogItem,
  CatalogItemKind,
  CatalogItemResponse,
  CatalogItemsResponse,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest
} from '@bellfield/contracts';

export type CatalogItemKindValue = CatalogItemKind;

export const catalogItemKinds = [
  'service',
  'part',
  'equipment',
  'labor',
  'fee',
  'discount',
  'agreement',
  'other'
] as const satisfies readonly CatalogItemKindValue[];

export type CatalogItemRecord = CatalogItem;
export type CatalogItemsResponseDto = CatalogItemsResponse;
export type CatalogItemResponseDto = CatalogItemResponse;
export type CreateCatalogItemRequestDto = CreateCatalogItemRequest;
export type UpdateCatalogItemRequestDto = UpdateCatalogItemRequest;
