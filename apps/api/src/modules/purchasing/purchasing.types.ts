import type {
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderLineKind,
  PurchaseOrderResponse,
  PurchaseOrderStatus,
  PurchaseOrderSummary,
  PurchaseOrdersResponse
} from '@bellfield/contracts';

export type PurchaseOrderStatusValue = PurchaseOrderStatus;
export type PurchaseOrderLineKindValue = PurchaseOrderLineKind;

export type PurchaseOrderDto = PurchaseOrder;
export type PurchaseOrderLineDto = PurchaseOrderLine;
export type PurchaseOrderSummaryDto = PurchaseOrderSummary;
export type PurchaseOrderResponseDto = PurchaseOrderResponse;
export type PurchaseOrdersResponseDto = PurchaseOrdersResponse;
export type CreatePurchaseOrderRequestDto = CreatePurchaseOrderRequest;

export const purchaseOrderLineKinds = [
  'part',
  'equipment'
] as const satisfies readonly PurchaseOrderLineKindValue[];
