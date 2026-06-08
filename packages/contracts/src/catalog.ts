export type CatalogItemKind =
  | 'service'
  | 'part'
  | 'equipment'
  | 'labor'
  | 'fee'
  | 'discount'
  | 'agreement'
  | 'other';

export type CatalogPriceMode = 'standard' | 'agreement';

export interface FieldCatalogItem {
  id: string;
  code?: string;
  name: string;
  kind: CatalogItemKind;
  category?: string;
  tradeTags: string[];
  description?: string;
  unitOfMeasure?: string;
  taxableDefault: boolean;
  defaultSalePrice?: number;
  agreementPrice?: number;
  estimatedLaborHours?: number;
  linkedInventoryItemId?: string;
  linkedInventoryItemSku?: string;
  linkedInventoryItemName?: string;
  updatedAt: string;
}

export interface FieldCatalogResponse {
  items: FieldCatalogItem[];
  serverTime: string;
  snapshotVersion: string;
}

export interface CatalogItem extends FieldCatalogItem {
  internalNotes?: string;
  costHint?: number;
  incomeCategory?: string;
  accountingExportCode?: string;
  fieldVisible: boolean;
  isActive: boolean;
  registerUsageCount: number;
  createdAt: string;
}

export interface CatalogItemsResponse {
  items: CatalogItem[];
}

export interface CatalogItemResponse {
  item: CatalogItem;
}

export interface CreateCatalogItemRequest {
  code?: string;
  name: string;
  kind: CatalogItemKind;
  category?: string;
  tradeTags?: string[];
  description?: string;
  internalNotes?: string;
  unitOfMeasure?: string;
  taxableDefault?: boolean;
  defaultSalePrice?: number;
  agreementPrice?: number;
  estimatedLaborHours?: number;
  costHint?: number;
  linkedInventoryItemId?: string;
  incomeCategory?: string;
  accountingExportCode?: string;
  fieldVisible?: boolean;
}

export interface UpdateCatalogItemRequest extends CreateCatalogItemRequest {
  taxableDefault: boolean;
  fieldVisible: boolean;
  isActive: boolean;
}

export interface RegisterCatalogSnapshot {
  catalogItemId?: string;
  code?: string;
  name: string;
  kind: CatalogItemKind;
  category?: string;
  description?: string;
  unitOfMeasure?: string;
  selectedUnitPrice?: number;
  taxable: boolean;
  priceMode: CatalogPriceMode;
  defaultSalePrice?: number;
  agreementPrice?: number;
  linkedInventoryItemId?: string;
  linkedInventoryItemSku?: string;
  linkedInventoryItemName?: string;
}
