import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ArOpenBalancesReport,
  InventoryValuationReport,
  JobProfitabilityReport,
  PermissionKey
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { queryOpenBalanceRows, queryPostedRevenueByJob } from '../bookkeeping/open-balance-query';
import {
  computeJobCostRollup,
  getCurrentJobCostSnapshot
} from '../job-costing/job-cost-rollup-utils';
import { queryInventoryOnHand } from '../inventory/inventory-onhand-query';
import { toCsv, type CsvColumn } from './report-csv';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

const AR_CSV_COLUMNS: CsvColumn<ArOpenBalancesReport['rows'][number]>[] = [
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Net billed', value: (row) => row.netBilled },
  { header: 'Paid', value: (row) => row.paidTotal },
  { header: 'Amount due', value: (row) => row.amountDue }
];

const PROFITABILITY_CSV_COLUMNS: CsvColumn<JobProfitabilityReport['rows'][number]>[] = [
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Status', value: (row) => row.status },
  { header: 'Revenue', value: (row) => row.revenue },
  { header: 'Material', value: (row) => row.materialCost },
  { header: 'Labor', value: (row) => row.laborCost },
  { header: 'Expense', value: (row) => row.expenseCost },
  { header: 'Total cost', value: (row) => row.totalCost },
  { header: 'Profit', value: (row) => row.profit },
  { header: 'Margin bps', value: (row) => row.marginBasisPoints },
  { header: 'Cost complete', value: (row) => (row.costComplete ? 'yes' : 'no') },
  { header: 'Unresolved lines', value: (row) => row.unresolvedLineCount },
  { header: 'Finalized', value: (row) => (row.isFinalized ? 'yes' : 'no') }
];

const INVENTORY_CSV_COLUMNS: CsvColumn<InventoryValuationReport['rows'][number]>[] = [
  { header: 'Item', value: (row) => row.itemName },
  { header: 'Kind', value: (row) => row.itemKind },
  { header: 'Location', value: (row) => row.locationName },
  { header: 'Quantity', value: (row) => row.quantity },
  { header: 'Avg unit cost', value: (row) => row.averageUnitCost },
  { header: 'Total value', value: (row) => row.totalValue }
];

/** A CSV export plus the suggested download filename. */
export type ReportCsvExport = { filename: string; csv: string };

/**
 * Read-only fixed business reports (M10 slice 3). Every figure is reused from an existing tested
 * calculation — this layer only aggregates totals over rows it did not compute. Each report has a
 * primary `reports:view` gate plus a report-specific secondary gate (see docs §5c).
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  /** AR / open-balance snapshot. Gate: reports:view + invoices:view. */
  async getArOpenBalances(sessionToken: string): Promise<ArOpenBalancesReport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, ['invoices:view']);
    return this.buildArOpenBalances();
  }

  /** AR / open-balance CSV export. Gate: reports:view + invoices:view + reports:export. */
  async exportArOpenBalances(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'invoices:view',
      'reports:export'
    ]);
    const report = await this.buildArOpenBalances();
    return {
      filename: `ar-open-balances-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(AR_CSV_COLUMNS, report.rows)
    };
  }

  /** Build the AR report (no auth — callers gate first). */
  private async buildArOpenBalances(): Promise<ArOpenBalancesReport> {
    // Reuse the bookkeeping open-balance calculation (un-limited) — no duplicated invoice/payment math.
    const rows = await queryOpenBalanceRows(this.databaseService, null);

    let netBilled = 0;
    let paidTotal = 0;
    let amountDue = 0;
    for (const row of rows) {
      netBilled += row.netBilled;
      paidTotal += row.paidTotal;
      amountDue += row.amountDue;
    }

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        jobCount: rows.length,
        netBilled: roundMoney(netBilled),
        paidTotal: roundMoney(paidTotal),
        amountDue: roundMoney(amountDue)
      },
      rows
    };
  }

  /** Job profitability. Gate: reports:view + jobCosting:view. */
  async getJobProfitability(sessionToken: string): Promise<JobProfitabilityReport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, ['jobCosting:view']);
    return this.buildJobProfitability();
  }

  /** Job profitability CSV export. Gate: reports:view + jobCosting:view + reports:export. */
  async exportJobProfitability(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'jobCosting:view',
      'reports:export'
    ]);
    const report = await this.buildJobProfitability();
    return {
      filename: `job-profitability-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(PROFITABILITY_CSV_COLUMNS, report.rows)
    };
  }

  /**
   * Build the profitability report (no auth — callers gate first). Population = jobs with ≥1 posted
   * invoice (revenue from the shared posted-invoice math). Cost is the M9 rollup, or the frozen
   * snapshot for finalized jobs — never invoice-line unit cost. Per-job loop by design (the rollup is
   * per-job; we do not duplicate it as batch SQL — see docs §5c.3).
   */
  private async buildJobProfitability(): Promise<JobProfitabilityReport> {
    const revenueRows = await queryPostedRevenueByJob(this.databaseService);
    const rows: JobProfitabilityReport['rows'] = [];

    for (const revenueRow of revenueRows) {
      const snapshot = await getCurrentJobCostSnapshot(this.databaseService, revenueRow.jobId);
      let materialCost: number;
      let laborCost: number;
      let expenseCost: number;
      let totalCost: number;
      let costComplete: boolean;
      let unresolvedLineCount: number;
      let isFinalized: boolean;

      if (snapshot) {
        // Finalized: cost is frozen and was complete at freeze time.
        materialCost = snapshot.materialCost;
        laborCost = snapshot.laborCost;
        expenseCost = snapshot.expenseCost;
        totalCost = snapshot.totalCost;
        costComplete = true;
        unresolvedLineCount = 0;
        isFinalized = true;
      } else {
        const rollup = await computeJobCostRollup(this.databaseService, revenueRow.jobId);
        materialCost = rollup.materialCost;
        laborCost = rollup.laborCost;
        expenseCost = rollup.expenseCost;
        totalCost = rollup.totalCost;
        costComplete = rollup.costComplete;
        unresolvedLineCount = rollup.unresolvedLineCount;
        isFinalized = false;
      }

      const revenue = revenueRow.netBilled;
      const profit = roundMoney(revenue - totalCost);
      // Null when there is no revenue base or the cost is still incomplete (a partial margin misleads).
      const marginBasisPoints =
        revenue === 0 || !costComplete ? null : Math.round((profit / revenue) * 10000);

      rows.push({
        jobId: revenueRow.jobId,
        jobNumber: revenueRow.jobNumber,
        customerName: revenueRow.customerName,
        status: revenueRow.status,
        revenue,
        materialCost,
        laborCost,
        expenseCost,
        totalCost,
        profit,
        marginBasisPoints,
        costComplete,
        unresolvedLineCount,
        isFinalized
      });
    }

    let revenue = 0;
    let knownCost = 0;
    let knownProfit = 0;
    let incompleteJobCount = 0;
    let unresolvedLineCount = 0;
    for (const row of rows) {
      revenue += row.revenue;
      knownCost += row.totalCost;
      knownProfit += row.profit;
      if (!row.costComplete) incompleteJobCount += 1;
      unresolvedLineCount += row.unresolvedLineCount;
    }

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        jobCount: rows.length,
        revenue: roundMoney(revenue),
        knownCost: roundMoney(knownCost),
        knownProfit: roundMoney(knownProfit),
        incompleteJobCount,
        unresolvedLineCount
      },
      rows
    };
  }

  /** Inventory valuation (on-hand at weighted-average cost). Gate: reports:view + inventory:view. */
  async getInventoryValuation(sessionToken: string): Promise<InventoryValuationReport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, ['inventory:view']);
    return this.buildInventoryValuation();
  }

  /** Inventory valuation CSV export. Gate: reports:view + inventory:view + reports:export. */
  async exportInventoryValuation(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'inventory:view',
      'reports:export'
    ]);
    const report = await this.buildInventoryValuation();
    return {
      filename: `inventory-valuation-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(INVENTORY_CSV_COLUMNS, report.rows)
    };
  }

  /** Build the valuation report (no auth — callers gate first). Reuses the shared on-hand projection
   * (weighted-average, zero balances excluded) — no new inventory math. */
  private async buildInventoryValuation(): Promise<InventoryValuationReport> {
    const rows = await queryInventoryOnHand(this.databaseService);

    let totalQuantity = 0;
    let totalValue = 0;
    for (const row of rows) {
      totalQuantity += row.quantity;
      totalValue += row.totalValue;
    }

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        rowCount: rows.length,
        totalQuantity: roundQuantity(totalQuantity),
        totalValue: roundMoney(totalValue)
      },
      rows
    };
  }

  /** Throw 403 when the actor lacks any of a report's secondary (domain-visibility/export) gates. */
  private requireSecondaryPermissions(held: PermissionKey[], keys: PermissionKey[]): void {
    for (const key of keys) {
      if (!held.includes(key)) {
        throw new ForbiddenException(`This report action requires the ${key} permission.`);
      }
    }
  }
}
