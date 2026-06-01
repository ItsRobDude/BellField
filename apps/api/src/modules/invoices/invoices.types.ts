import type {
  EstimateDiscount,
  InvoiceKind,
  InvoiceLineItemKind,
  InvoiceLineItemSummary,
  InvoiceLineSourceKind,
  InvoiceLineSourceSyncState,
  InvoiceResponse,
  InvoiceStatus,
  InvoiceSummary,
  InvoiceTotals
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
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type InvoiceLineItemRecord = InvoiceLineItemSummary;
