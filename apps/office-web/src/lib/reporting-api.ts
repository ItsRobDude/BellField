import type {
  ArOpenBalancesReport,
  InventoryValuationReport,
  JobProfitabilityReport
} from '@bellfield/contracts';
import { requestBlob, requestJson } from './operations-api-base';

export type {
  ArOpenBalancesReport,
  JobProfitabilityReport,
  InventoryValuationReport
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
