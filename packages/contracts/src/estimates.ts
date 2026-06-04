// Estimate lines add 'equipment' to the register kinds: estimates routinely quote
// replacement equipment, which captured field work does not.
export type EstimateLineItemKind =
  | 'labor'
  | 'serviceItem'
  | 'part'
  | 'equipment'
  | 'membership'
  | 'other';

// v1 estimate lifecycle (docs/data-modeling-rules.md): pending -> approved | declined.
// No 'sent'/'expired' yet; approval does not auto-create downstream records.
export type EstimateStatus = 'pending' | 'approved' | 'declined';

export type EstimateDiscountKind = 'percent' | 'fixed';

export interface EstimateLineItemSummary {
  id: string;
  estimateId: string;
  /** Stable display order within the estimate, starting at 0. */
  position: number;
  kind: EstimateLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  /** Customer-facing sell price per unit (dollars). Always present on a line. */
  unitPrice: number;
  /** Internal cost per unit (dollars). Optional; absence makes the estimate's margin a ceiling. */
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
  /** Snapshotted engine output for this line. */
  lineSubtotal: number;
  lineCost?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Optional whole-estimate discount. `percent` uses basisPoints (1000 = 10%);
 * `fixed` uses amount (dollars). Mirrors the @bellfield/estimating engine input.
 */
export type EstimateDiscount =
  | { kind: 'percent'; basisPoints: number }
  | { kind: 'fixed'; amount: number };

/** Snapshotted pricing totals (dollars) produced by the shared estimating engine. */
export interface EstimateTotals {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
  totalCost: number;
  profit: number;
  /** Null when there is no positive price to express a margin against. */
  marginBasisPoints: number | null;
  /** False when at least one line lacks a cost, so profit/margin are an optimistic ceiling. */
  costComplete: boolean;
}

export interface EstimateSummary {
  id: string;
  jobId: string;
  status: EstimateStatus;
  title: string;
  description?: string;
  taxRateBasisPoints: number;
  discount?: EstimateDiscount;
  validUntil?: string;
  lineItems: EstimateLineItemSummary[];
  totals: EstimateTotals;
  approvedAt?: string;
  approvedByEmployeeId?: string;
  approvedByName?: string;
  declinedAt?: string;
  declinedByEmployeeId?: string;
  declinedByName?: string;
  /** Set when this estimate was cloned from an earlier one to revise it. */
  sourceEstimateId?: string;
  /** Set on an older estimate that a newer one has replaced. */
  supersededByEstimateId?: string;
  /** Set once this estimate has been converted into an invoice draft. */
  convertedToInvoiceId?: string;
  createdByEmployeeId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * A line as supplied by the client when creating or replacing an estimate. The
 * server assigns ids and positions (by array order) and computes all snapshot
 * totals via the shared engine — clients never send computed amounts.
 */
export interface EstimateLineItemInput {
  kind: EstimateLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
}

export interface EstimatesResponse {
  estimates: EstimateSummary[];
}

export interface EstimateResponse {
  estimate: EstimateSummary;
}

export interface CreateEstimateRequest {
  title: string;
  description?: string;
  taxRateBasisPoints?: number;
  discount?: EstimateDiscount;
  validUntil?: string;
  lineItems: EstimateLineItemInput[];
}

/** Whole-estimate replacement; only permitted while the estimate is pending. */
export interface UpdateEstimateRequest {
  title?: string;
  description?: string;
  taxRateBasisPoints?: number;
  discount?: EstimateDiscount | null;
  validUntil?: string | null;
  lineItems?: EstimateLineItemInput[];
}

export interface DeclineEstimateRequest {
  reason?: string;
}

/**
 * Convert an approved estimate into the job's invoice draft. `mode` decides what
 * happens to lines already on the draft: 'append' adds the estimate's lines
 * after them; 'replace' voids the existing draft lines first. Omitting `mode`
 * when the draft already has active lines is rejected (block-with-choice), so a
 * conversion can never silently duplicate billing.
 */
export interface ConvertEstimateToInvoiceRequest {
  mode?: 'append' | 'replace';
}
