import type {
  CancelOutboundMessageResponse,
  EstimateDiscount,
  InvoiceKind,
  InvoiceLineItemKind,
  InvoiceLineItemSummary,
  InvoiceLineSourceKind,
  InvoiceLineSourceSyncState,
  InvoiceResponse,
  InvoiceSendPreviewResponse,
  InvoiceStatus,
  InvoiceSummary,
  InvoiceTotals,
  OutboundMessagesResponse,
  PostedInvoiceContext,
  SendInvoiceRequest,
  SendInvoiceResponse
} from '@bellfield/contracts';

// Alias the contract shapes the controller/service speak in, mirroring the
// estimates module's convention.
export type InvoiceStatusValue = InvoiceStatus;
export type InvoiceKindValue = InvoiceKind;
export type InvoiceLineItemKindValue = InvoiceLineItemKind;
export type InvoiceLineSourceKindValue = InvoiceLineSourceKind;
export type InvoiceLineSourceSyncStateValue = InvoiceLineSourceSyncState;
export type InvoiceSummaryDto = InvoiceSummary;
export type InvoiceResponseDto = InvoiceResponse;
export type SendInvoiceRequestDto = SendInvoiceRequest;
export type SendInvoiceResponseDto = SendInvoiceResponse;
export type InvoiceSendPreviewResponseDto = InvoiceSendPreviewResponse;
export type InvoiceOutboundMessagesResponseDto = OutboundMessagesResponse;
export type InvoiceCancelOutboundMessageResponseDto = CancelOutboundMessageResponse;
export type InvoiceDiscountValue = EstimateDiscount;
export type InvoiceTotalsValue = InvoiceTotals;

/** A fully resolved invoice as the repository reads it. Money values are decimal dollars. */
export type InvoiceRecord = {
  id: string;
  jobId: string;
  invoiceKind: InvoiceKindValue;
  status: InvoiceStatusValue;
  taxRateBasisPoints: number;
  discount?: InvoiceDiscountValue;
  lineItems: InvoiceLineItemRecord[];
  totals: InvoiceTotalsValue;
  /** Frozen customer/location/job display context; present only once posted. */
  posted?: PostedInvoiceContext;
  /** For an adjustment/credit, the main invoice it corrects. Undefined for the main. */
  adjustsInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type InvoiceLineItemRecord = InvoiceLineItemSummary;

/**
 * The current customer/location/job display context the service resolves and the
 * repository freezes onto the invoice at posting. Sourced from the bill-to customer,
 * service location, and job records as they exist at the posting moment.
 */
export type PostedSnapshotInput = {
  billToCustomerId: string;
  billToCustomerName: string;
  billToAccountType: string;
  billToAddressLine1: string;
  billToCity: string;
  billToState: string;
  billToPostalCode: string;
  serviceLocationId: string;
  serviceLocationName: string;
  serviceLocationAddressLine1: string;
  serviceLocationCity: string;
  serviceLocationState: string;
  serviceLocationPostalCode: string;
  jobNumber: string;
  workOrderNumber?: string;
};
