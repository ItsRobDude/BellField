import type {
  CreateEstimateRequest,
  ApproveEstimateRequest,
  DeclineEstimateRequest,
  EstimateDiscount,
  EstimateLineItemInput,
  EstimateLineItemKind,
  EstimateOptionGroupInput,
  EstimateOptionGroupSummary,
  EstimateResponse,
  EstimatesResponse,
  EstimateStatus,
  EstimateSummary,
  OutboundMessagesResponse,
  SendEstimateRequest,
  SendEstimateResponse,
  UpdateEstimateRequest
} from '@bellfield/contracts';

// Re-export the contract shapes the controller/service speak in, mirroring how
// other modules alias their request/response DTOs to the shared contract types.
export type EstimateStatusValue = EstimateStatus;
export type EstimateLineItemKindValue = EstimateLineItemKind;
export type EstimateSummaryDto = EstimateSummary;
export type EstimatesResponseDto = EstimatesResponse;
export type EstimateResponseDto = EstimateResponse;
export type CreateEstimateRequestDto = CreateEstimateRequest;
export type UpdateEstimateRequestDto = UpdateEstimateRequest;
export type ApproveEstimateRequestDto = ApproveEstimateRequest;
export type DeclineEstimateRequestDto = DeclineEstimateRequest;
export type SendEstimateRequestDto = SendEstimateRequest;
export type SendEstimateResponseDto = SendEstimateResponse;
export type OutboundMessagesResponseDto = OutboundMessagesResponse;
export type EstimateLineItemInputValue = EstimateLineItemInput;
export type EstimateDiscountValue = EstimateDiscount;
export type EstimateOptionGroupInputValue = EstimateOptionGroupInput;
export type EstimateOptionGroupRecord = EstimateOptionGroupSummary;

export const estimateLineItemKinds = [
  'labor',
  'serviceItem',
  'part',
  'equipment',
  'membership',
  'other'
] as const satisfies readonly EstimateLineItemKindValue[];

/**
 * A fully resolved estimate as the repository reads/writes it. Money values are
 * decimal-dollar numbers (numeric(12,2) in the database). The persisted totals
 * here are the snapshot the service computed from the shared estimating engine.
 */
export type EstimateRecord = {
  id: string;
  jobId: string;
  status: EstimateStatusValue;
  title: string;
  description?: string;
  taxRateBasisPoints: number;
  discount?: EstimateDiscountValue;
  validUntil?: string;
  lineItems: EstimateLineItemRecord[];
  totals: EstimateTotalsRecord;
  optionGroups?: EstimateOptionGroupRecord[];
  selectedOptionId?: string;
  approvedAt?: string;
  approvedByEmployeeId?: string;
  approvedByName?: string;
  declinedAt?: string;
  declinedByEmployeeId?: string;
  declinedByName?: string;
  sourceEstimateId?: string;
  supersededByEstimateId?: string;
  convertedToInvoiceId?: string;
  createdByEmployeeId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type EstimateLineItemRecord = {
  id: string;
  estimateId: string;
  position: number;
  kind: EstimateLineItemKindValue;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
  catalogItemId?: string;
  catalogSnapshot?: EstimateLineItemInputValue['catalogSnapshot'];
  optionGroupId?: string;
  optionId?: string;
  lineSubtotal: number;
  lineCost?: number;
  createdAt: string;
  updatedAt: string;
};

export type EstimateTotalsRecord = {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
  totalCost: number;
  profit: number;
  marginBasisPoints: number | null;
  costComplete: boolean;
};

/** Resolved, validated input the service hands the repository on create/replace. */
export type EstimateWriteInput = {
  title: string;
  description?: string;
  taxRateBasisPoints: number;
  discount?: EstimateDiscountValue;
  validUntil?: string;
  lineItems: EstimateLineItemInputValue[];
  totals: EstimateTotalsRecord;
  optionGroups?: EstimateOptionGroupRecord[];
  selectedOptionId?: string;
  /** Pre-priced per-line snapshots, aligned by index with lineItems. */
  lineTotals: Array<{ lineSubtotal: number; lineCost?: number }>;
};
