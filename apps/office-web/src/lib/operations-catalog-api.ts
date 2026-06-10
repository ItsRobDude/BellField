import type {
  CatalogCategoriesResponse,
  CatalogCategoryResponse,
  CatalogItemResponse,
  CatalogItemsResponse,
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export type {
  CatalogLineSnapshot,
  CatalogCategoriesResponse,
  CatalogCategory,
  CatalogCategoryResponse,
  CatalogItem,
  CatalogItemKind,
  CatalogItemResponse,
  CatalogItemsResponse,
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  UpdateCatalogCategoryRequest,
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

export async function getOfficeCatalogCategories(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CatalogCategoriesResponse> {
  return requestJson<CatalogCategoriesResponse>('/operations/catalog/categories', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeCatalogCategory(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateCatalogCategoryRequest;
}): Promise<CatalogCategoryResponse> {
  return requestJson<CatalogCategoryResponse>('/operations/catalog/categories', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

export async function updateOfficeCatalogCategory(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  catalogCategoryId: string;
  body: UpdateCatalogCategoryRequest;
}): Promise<CatalogCategoryResponse> {
  return requestJson<CatalogCategoryResponse>(
    `/operations/catalog/categories/${input.catalogCategoryId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'PUT',
      body: JSON.stringify(input.body)
    }
  );
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
