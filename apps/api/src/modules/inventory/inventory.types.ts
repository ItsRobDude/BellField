import type {
  CreateInventoryItemRequest,
  CreateInventoryLocationRequest,
  InventoryItem,
  InventoryItemKind,
  InventoryItemResponse,
  InventoryItemsResponse,
  InventoryLocation,
  InventoryLocationKind,
  InventoryLocationResponse,
  InventoryLocationsResponse,
  UpdateInventoryItemRequest,
  UpdateInventoryLocationRequest
} from '@bellfield/contracts';

export type InventoryItemKindValue = InventoryItemKind;
export type InventoryLocationKindValue = InventoryLocationKind;

export type InventoryItemDto = InventoryItem;
export type InventoryItemResponseDto = InventoryItemResponse;
export type InventoryItemsResponseDto = InventoryItemsResponse;
export type CreateInventoryItemRequestDto = CreateInventoryItemRequest;
export type UpdateInventoryItemRequestDto = UpdateInventoryItemRequest;

export type InventoryLocationDto = InventoryLocation;
export type InventoryLocationResponseDto = InventoryLocationResponse;
export type InventoryLocationsResponseDto = InventoryLocationsResponse;
export type CreateInventoryLocationRequestDto = CreateInventoryLocationRequest;
export type UpdateInventoryLocationRequestDto = UpdateInventoryLocationRequest;

export const inventoryItemKinds = [
  'part',
  'equipment'
] as const satisfies readonly InventoryItemKindValue[];
export const inventoryLocationKinds = [
  'warehouse',
  'truck',
  'other'
] as const satisfies readonly InventoryLocationKindValue[];

/** A catalog item as the repository reads/writes it. */
export type InventoryItemRecord = InventoryItem;

/** A stock location as the repository reads/writes it. */
export type InventoryLocationRecord = InventoryLocation;
