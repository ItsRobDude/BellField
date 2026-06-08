import type {
  CatalogItemResponse,
  CatalogItemsResponse,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export type {
  CatalogItem,
  CatalogItemKind,
  CatalogItemResponse,
  CatalogItemsResponse,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest
} from '@bellfield/contracts';

export async function getOfficeCatalogItems(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CatalogItemsResponse> {
  return requestJson<CatalogItemsResponse>('/operations/catalog/items', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeCatalogItem(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateCatalogItemRequest;
}): Promise<CatalogItemResponse> {
  return requestJson<CatalogItemResponse>('/operations/catalog/items', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

export async function updateOfficeCatalogItem(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  catalogItemId: string;
  body: UpdateCatalogItemRequest;
}): Promise<CatalogItemResponse> {
  return requestJson<CatalogItemResponse>(`/operations/catalog/items/${input.catalogItemId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PUT',
    body: JSON.stringify(input.body)
  });
}
