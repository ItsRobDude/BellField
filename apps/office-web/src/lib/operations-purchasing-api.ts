import type {
  CreatePurchaseOrderRequest,
  PurchaseOrderResponse,
  PurchaseOrdersResponse,
  ReceivePurchaseOrderRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

// Purchasing contract types, re-exported for the office UI.
export type {
  PurchaseOrder,
  PurchaseOrderSummary,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderDestinationKind,
  PurchaseOrderLineKind,
  PurchaseOrderResponse,
  PurchaseOrdersResponse,
  CreatePurchaseOrderRequest,
  CreatePurchaseOrderLineRequest,
  ReceivePurchaseOrderRequest,
  ReceivePurchaseOrderLineInput
} from '@bellfield/contracts';

/** Purchase-order summaries (newest first). */
export async function listOfficePurchaseOrders(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<PurchaseOrdersResponse> {
  return requestJson<PurchaseOrdersResponse>('/operations/purchase-orders', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** A single purchase order with its lines. */
export async function getOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  purchaseOrderId: string;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>(
    `/operations/purchase-orders/${input.purchaseOrderId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

/** Create a draft purchase order (one destination, ≥1 line). */
export async function createOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreatePurchaseOrderRequest;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>('/operations/purchase-orders', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Transition a draft purchase order to ordered. */
export async function orderOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  purchaseOrderId: string;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>(
    `/operations/purchase-orders/${input.purchaseOrderId}/order`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST'
    }
  );
}

/** Receive an ordered purchase order in full. */
export async function receiveOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  purchaseOrderId: string;
  body: ReceivePurchaseOrderRequest;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>(
    `/operations/purchase-orders/${input.purchaseOrderId}/receive`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST',
      body: JSON.stringify(input.body)
    }
  );
}
