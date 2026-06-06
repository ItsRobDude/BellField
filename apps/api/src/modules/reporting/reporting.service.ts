import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ArOpenBalancesReport, PermissionKey } from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { queryOpenBalanceRows } from '../bookkeeping/open-balance-query';
import { toCsv, type CsvColumn } from './report-csv';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const AR_CSV_COLUMNS: CsvColumn<ArOpenBalancesReport['rows'][number]>[] = [
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Net billed', value: (row) => row.netBilled },
  { header: 'Paid', value: (row) => row.paidTotal },
  { header: 'Amount due', value: (row) => row.amountDue }
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

  /** Throw 403 when the actor lacks any of a report's secondary (domain-visibility/export) gates. */
  private requireSecondaryPermissions(held: PermissionKey[], keys: PermissionKey[]): void {
    for (const key of keys) {
      if (!held.includes(key)) {
        throw new ForbiddenException(`This report action requires the ${key} permission.`);
      }
    }
  }
}
