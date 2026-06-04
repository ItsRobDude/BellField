// --- Purchase orders (Milestone 9) ----------------------------------------------

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'closed';

export type PurchaseOrderLineKind = 'part' | 'equipment';

/** A PO ends at exactly one destination: an inventory location (incl. trucks) or a customer location. */
export type PurchaseOrderDestinationKind = 'inventory' | 'customer';

export interface PurchaseOrderLine {
  id: string;
  position: number;
  itemId?: string;
  itemName?: string;
  kind: PurchaseOrderLineKind;
  description: string;
  quantity: number;
  expectedUnitCost: number;
  expectedLineCost: number;
  equipmentType?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  equipmentSerial?: string;
}

export interface PurchaseOrderSummary {
  id: string;
  poNumber?: string;
  vendorName: string;
  status: PurchaseOrderStatus;
  destinationKind: PurchaseOrderDestinationKind;
  destinationId: string;
  destinationName: string;
  jobId?: string;
  jobNumber?: string;
  expectedTotalCost: number;
  lineCount: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder extends PurchaseOrderSummary {
  notes?: string;
  orderedAt?: string;
  orderedByName?: string;
  lines: PurchaseOrderLine[];
}

export interface CreatePurchaseOrderLineRequest {
  itemId?: string;
  kind: PurchaseOrderLineKind;
  description: string;
  quantity: number;
  expectedUnitCost: number;
  equipmentType?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  equipmentSerial?: string;
}

export interface CreatePurchaseOrderRequest {
  poNumber?: string;
  vendorName: string;
  /** Provide exactly one of these two destinations. */
  destinationInventoryLocationId?: string;
  destinationCustomerLocationId?: string;
  jobId?: string;
  notes?: string;
  lines: CreatePurchaseOrderLineRequest[];
}

export interface PurchaseOrderResponse {
  purchaseOrder: PurchaseOrder;
}

export interface PurchaseOrdersResponse {
  purchaseOrders: PurchaseOrderSummary[];
}

/** Optional per-line actuals when receiving a PO (defaults to the line's expected values). */
export interface ReceivePurchaseOrderLineInput {
  purchaseOrderLineId: string;
  quantity?: number;
  unitCost?: number;
  /** Serial captured at receiving for an equipment line (often unknown until arrival). */
  serialNumber?: string;
}

/** Receive a purchase order in full. Lines omitted from `lines` receive at expected qty/cost. */
export interface ReceivePurchaseOrderRequest {
  note?: string;
  lines?: ReceivePurchaseOrderLineInput[];
  /** Acknowledge creating equipment without a serial number (parallels equipment create). */
  confirmMissingSerial?: boolean;
}
