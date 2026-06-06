import type { ArOpenBalancesReport } from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

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
