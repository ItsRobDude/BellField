// Fixed, read-only reporting projections (M10 slice 3). Every figure is reused from an existing
// tested calculation — AR/profitability revenue from the bookkeeping open-balance CTE, profitability
// cost from the M9 job-cost rollup/snapshot, valuation from the inventory on-hand projection. These
// are current-state snapshots (see `generatedAt`), not as-of historical accounting. Owner/Admin plus
// role-specific gates — see docs/m10-trust-admin-plan.md §5c.

import type { JobStatus } from './jobs.js';
import type { InventoryItemKind } from './inventory.js';
import type {
  ServiceAgreementBillingCadence,
  ServiceAgreementStatus,
  ServiceAgreementVisitFrequency
} from './service-agreements.js';

/** AR / open-balance snapshot: jobs that still owe money. Rows only where `amountDue > 0`. */
export interface ArOpenBalancesReport {
  generatedAt: string;
  totals: {
    jobCount: number;
    netBilled: number;
    paidTotal: number;
    amountDue: number;
  };
  rows: Array<{
    jobId: string;
    jobNumber: string;
    customerName: string;
    /** Posted main + adjustment − credit. */
    netBilled: number;
    /** Sum of non-void payments. */
    paidTotal: number;
    amountDue: number;
  }>;
}

export interface ArAgingReport {
  generatedAt: string;
  totals: {
    jobCount: number;
    current: number;
    days31To60: number;
    days61To90: number;
    over90: number;
    amountDue: number;
  };
  rows: Array<{
    jobId: string;
    jobNumber: string;
    customerName: string;
    oldestPostedAt: string;
    daysOld: number;
    amountDue: number;
    bucket: 'current' | 'days31To60' | 'days61To90' | 'over90';
  }>;
}

export interface SalesTaxSummaryReport {
  generatedAt: string;
  totals: {
    invoiceCount: number;
    taxableBase: number;
    tax: number;
    total: number;
  };
  rows: Array<{
    taxRateBasisPoints: number;
    invoiceCount: number;
    taxableBase: number;
    tax: number;
    total: number;
  }>;
}

export interface PostedInvoiceExportRow {
  invoiceId: string;
  jobId: string;
  jobNumber: string;
  customerName: string;
  invoiceKind: 'main' | 'adjustment' | 'credit';
  postedAt: string;
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
}

export interface PaymentLedgerExportRow {
  paymentId: string;
  invoiceId: string;
  jobId: string;
  jobNumber: string;
  customerName: string;
  amount: number;
  method: string;
  receivedAt: string;
  reference?: string;
  memo?: string;
  recordedByName: string;
  isVoid: boolean;
  voidedAt?: string;
  voidReason?: string;
}

/** Per-job profitability. Revenue from posted invoices; cost from the M9 rollup/snapshot (never
 * invoice-line unit cost). When `costComplete` is false the profit is "known so far", not final. */
export interface JobProfitabilityReport {
  generatedAt: string;
  totals: {
    jobCount: number;
    revenue: number;
    knownCost: number;
    knownProfit: number;
    /** Jobs whose cost is not yet complete (still have unresolved register lines). */
    incompleteJobCount: number;
    /** Sum of unresolved register lines across all rows. */
    unresolvedLineCount: number;
  };
  rows: Array<{
    jobId: string;
    jobNumber: string;
    customerName: string;
    status: JobStatus;
    revenue: number;
    materialCost: number;
    laborCost: number;
    expenseCost: number;
    totalCost: number;
    /** revenue − totalCost (known profit so far when cost is incomplete). */
    profit: number;
    /** profit / revenue in basis points; null when revenue is 0 or cost is incomplete. */
    marginBasisPoints: number | null;
    costComplete: boolean;
    unresolvedLineCount: number;
    /** Cost read from a frozen snapshot rather than recomputed live. */
    isFinalized: boolean;
  }>;
}

/** Current on-hand inventory valued at weighted-average cost per (item, location). Excludes zero
 * balances. No reorder thresholds exist yet, so there is deliberately no low-stock variant. */
export interface InventoryValuationReport {
  generatedAt: string;
  totals: {
    rowCount: number;
    totalQuantity: number;
    totalValue: number;
  };
  rows: Array<{
    itemId: string;
    itemName: string;
    itemKind: InventoryItemKind;
    locationId: string;
    locationName: string;
    quantity: number;
    averageUnitCost: number;
    totalValue: number;
  }>;
}

export interface ServiceAgreementReportRow {
  agreementId: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  status: ServiceAgreementStatus;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  billingCadence: ServiceAgreementBillingCadence;
  nextBillingDate?: string;
  billingAmount?: number;
  coveredLocationNames: string[];
  coveredEquipmentCount: number;
  activeVisitTemplateCount: number;
  updatedAt: string;
}

export interface ServiceAgreementBillingDueReportRow extends ServiceAgreementReportRow {
  daysUntilBilling: number;
}

export interface ServiceAgreementVisitTemplatePromptRow {
  agreementId: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  agreementName: string;
  templateId: string;
  title: string;
  frequency: ServiceAgreementVisitFrequency;
  preferredMonth?: number;
  preferredDayOfMonth?: number;
  projectedDueDate?: string;
  daysUntilProjectedDue?: number;
  timeWindowLabel?: string;
  jobType?: string;
  category?: string;
  summary?: string;
  estimatedDurationMinutes?: number;
  coveredLocationNames: string[];
}

export interface ServiceAgreementReports {
  generatedAt: string;
  windows: {
    expiringSoonThrough: string;
    nextBillingDueThrough: string;
    visitTemplatePromptThrough: string;
  };
  totals: {
    activeAgreementCount: number;
    expiringSoonCount: number;
    nextBillingDueCount: number;
    visitTemplatePromptCount: number;
  };
  activeAgreements: ServiceAgreementReportRow[];
  expiringSoon: ServiceAgreementReportRow[];
  nextBillingDue: ServiceAgreementBillingDueReportRow[];
  visitTemplatePrompts: ServiceAgreementVisitTemplatePromptRow[];
}
