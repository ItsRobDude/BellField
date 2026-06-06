import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ArOpenBalancesReport, PermissionKey } from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { queryOpenBalanceRows } from '../bookkeeping/open-balance-query';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

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
    this.requireSecondaryPermission(employee.effectivePermissions, 'invoices:view');

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

  /** Throw 403 when the actor lacks a report's secondary (domain-visibility) permission. */
  private requireSecondaryPermission(held: PermissionKey[], key: PermissionKey): void {
    if (!held.includes(key)) {
      throw new ForbiddenException(`This report requires the ${key} permission.`);
    }
  }
}
