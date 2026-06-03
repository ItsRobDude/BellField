import type {
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  PurchaseOrderLineKind,
  PurchaseOrderResponse,
  PurchaseOrderSummary,
  PurchaseOrdersResponse
} from '@bellfield/contracts';

export type PurchaseOrderLineKindValue = PurchaseOrderLineKind;

export type PurchaseOrderDto = PurchaseOrder;
export type PurchaseOrderSummaryDto = PurchaseOrderSummary;
export type PurchaseOrderResponseDto = PurchaseOrderResponse;
export type PurchaseOrdersResponseDto = PurchaseOrdersResponse;
export type CreatePurchaseOrderRequestDto = CreatePurchaseOrderRequest;

export const purchaseOrderLineKinds = [
  'part',
  'equipment'
] as const satisfies readonly PurchaseOrderLineKindValue[];
