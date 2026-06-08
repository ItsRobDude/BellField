import type {
  ArAgingReport,
  ArOpenBalancesReport,
  InventoryValuationReport,
  JobProfitabilityReport,
  SalesTaxSummaryReport,
  ServiceAgreementReports
} from '@bellfield/contracts';
import { requestBlob, requestJson } from './operations-api-base';

export type {
  ArOpenBalancesReport,
  ArAgingReport,
  JobProfitabilityReport,
  InventoryValuationReport,
  SalesTaxSummaryReport,
  ServiceAgreementReports
} from '@bellfield/contracts';

/** AR / open-balance snapshot. Gate: reports:view + invoices:view. */
export async function getArOpenBalances(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<ArOpenBalancesReport> {
  return requestJson<ArOpenBalancesReport>('/operations/reports/ar-open-balances', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Download the AR report as CSV. Server-gated: reports:view + invoices:view + reports:export. */
export async function downloadArOpenBalancesCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/ar-open-balances/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function getArAging(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<ArAgingReport> {
  return requestJson<ArAgingReport>('/operations/reports/ar-aging', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadArAgingCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/ar-aging/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function getSalesTaxSummary(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<SalesTaxSummaryReport> {
  return requestJson<SalesTaxSummaryReport>('/operations/reports/sales-tax-summary', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadSalesTaxSummaryCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/sales-tax-summary/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadPostedInvoicesCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/posted-invoices/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadPaymentLedgerCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/payment-ledger/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Service agreement reports. Gate: reports:view + agreements:view. */
export async function getServiceAgreementReports(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<ServiceAgreementReports> {
  return requestJson<ServiceAgreementReports>('/operations/reports/service-agreements', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadActiveServiceAgreementsCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/service-agreements/active/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadExpiringServiceAgreementsCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/service-agreements/expiring/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadServiceAgreementBillingDueCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/service-agreements/billing-due/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function downloadServiceAgreementVisitPromptsCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/service-agreements/visit-prompts/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Job profitability. Gate: reports:view + jobCosting:view. */
export async function getJobProfitability(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobProfitabilityReport> {
  return requestJson<JobProfitabilityReport>('/operations/reports/job-profitability', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Download profitability as CSV. Server-gated: reports:view + jobCosting:view + reports:export. */
export async function downloadJobProfitabilityCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/job-profitability/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Inventory valuation. Gate: reports:view + inventory:view. */
export async function getInventoryValuation(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryValuationReport> {
  return requestJson<InventoryValuationReport>('/operations/reports/inventory-valuation', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Download valuation as CSV. Server-gated: reports:view + inventory:view + reports:export. */
export async function downloadInventoryValuationCsv(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/operations/reports/inventory-valuation/export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}
