import type {
  CreateInventoryAdjustmentRequest,
  CreateInventoryIssueRequest,
  CreateInventoryItemRequest,
  CreateInventoryLocationRequest,
  CreateInventoryTransferRequest,
  InventoryItemResponse,
  InventoryItemsResponse,
  InventoryLocationResponse,
  InventoryLocationsResponse,
  InventoryMovementResponse,
  InventoryOnHandResponse,
  UpdateInventoryItemRequest,
  UpdateInventoryLocationRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

// Inventory contract types, re-exported so office UI imports them from the API client layer.
export type {
  InventoryItem,
  InventoryItemKind,
  InventoryItemResponse,
  InventoryItemsResponse,
  CreateInventoryItemRequest,
  UpdateInventoryItemRequest,
  InventoryLocation,
  InventoryLocationKind,
  InventoryLocationResponse,
  InventoryLocationsResponse,
  CreateInventoryLocationRequest,
  UpdateInventoryLocationRequest,
  InventoryMovement,
  InventoryMovementKind,
  InventoryMovementResponse,
  InventoryOnHandRow,
  InventoryOnHandResponse,
  CreateInventoryAdjustmentRequest,
  CreateInventoryTransferRequest,
  CreateInventoryIssueRequest
} from '@bellfield/contracts';

/** Inventory catalog items (active first, then by name). */
export async function getOfficeInventoryItems(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryItemsResponse> {
  return requestJson<InventoryItemsResponse>('/operations/inventory/items', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Stock locations (warehouses, trucks). */
export async function getOfficeInventoryLocations(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryLocationsResponse> {
  return requestJson<InventoryLocationsResponse>('/operations/inventory/locations', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Derived on-hand per (item, location): quantity, weighted-average cost, total value. */
export async function getOfficeInventoryOnHand(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/on-hand', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** The immutable movement ledger, optionally filtered to one item or job (newest first). */
export async function getOfficeInventoryMovements(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  itemId?: string;
  jobId?: string;
}): Promise<InventoryMovementResponse> {
  const query = new URLSearchParams();
  if (input.itemId) {
    query.set('itemId', input.itemId);
  }
  if (input.jobId) {
    query.set('jobId', input.jobId);
  }
  const suffix = query.toString();
  return requestJson<InventoryMovementResponse>(
    `/operations/inventory/movements${suffix ? `?${suffix}` : ''}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

/** Create a catalog item. */
export async function createOfficeInventoryItem(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryItemRequest;
}): Promise<InventoryItemResponse> {
  return requestJson<InventoryItemResponse>('/operations/inventory/items', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Update a catalog item (including active state). */
export async function updateOfficeInventoryItem(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  itemId: string;
  body: UpdateInventoryItemRequest;
}): Promise<InventoryItemResponse> {
  return requestJson<InventoryItemResponse>(`/operations/inventory/items/${input.itemId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PUT',
    body: JSON.stringify(input.body)
  });
}

/** Create a stock location. */
export async function createOfficeInventoryLocation(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryLocationRequest;
}): Promise<InventoryLocationResponse> {
  return requestJson<InventoryLocationResponse>('/operations/inventory/locations', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Update a stock location (including active state). */
export async function updateOfficeInventoryLocation(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  locationId: string;
  body: UpdateInventoryLocationRequest;
}): Promise<InventoryLocationResponse> {
  return requestJson<InventoryLocationResponse>(
    `/operations/inventory/locations/${input.locationId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'PUT',
      body: JSON.stringify(input.body)
    }
  );
}

/** Adjust on-hand at a location (gain/loss). Returns refreshed on-hand. */
export async function createOfficeInventoryAdjustment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryAdjustmentRequest;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/adjustments', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Transfer stock between two locations. Returns refreshed on-hand. */
export async function createOfficeInventoryTransfer(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryTransferRequest;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/transfers', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Issue stock from a location to a job. Returns refreshed on-hand. */
export async function issueOfficeInventoryToJob(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryIssueRequest;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/issues', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}
