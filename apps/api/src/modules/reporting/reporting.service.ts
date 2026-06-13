import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ArAgingReport,
  ArOpenBalancesReport,
  InventoryValuationReport,
  JobProfitabilityReport,
  PaymentLedgerExportRow,
  PermissionKey,
  PostedInvoiceExportRow,
  SalesTaxSummaryReport,
  ServiceAgreementReports
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
import {
  buildServiceAgreementReports,
  SERVICE_AGREEMENT_ACTIVE_CSV_COLUMNS,
  SERVICE_AGREEMENT_BILLING_CSV_COLUMNS,
  SERVICE_AGREEMENT_EXPIRING_CSV_COLUMNS,
  SERVICE_AGREEMENT_VISIT_TEMPLATE_CSV_COLUMNS
} from './service-agreement-reporting';

function roundMoney(value: string | number): number {
  return Math.round(Number(value) * 100) / 100;
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

const AR_AGING_CSV_COLUMNS: CsvColumn<ArAgingReport['rows'][number]>[] = [
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Oldest posted', value: (row) => row.oldestPostedAt.slice(0, 10) },
  { header: 'Days old', value: (row) => row.daysOld },
  { header: 'Bucket', value: (row) => row.bucket },
  { header: 'Amount due', value: (row) => row.amountDue }
];

const SALES_TAX_CSV_COLUMNS: CsvColumn<SalesTaxSummaryReport['rows'][number]>[] = [
  { header: 'Tax rate bps', value: (row) => row.taxRateBasisPoints },
  { header: 'Invoice count', value: (row) => row.invoiceCount },
  { header: 'Taxable base', value: (row) => row.taxableBase },
  { header: 'Tax', value: (row) => row.tax },
  { header: 'Total', value: (row) => row.total }
];

const POSTED_INVOICE_CSV_COLUMNS: CsvColumn<PostedInvoiceExportRow>[] = [
  { header: 'Invoice ID', value: (row) => row.invoiceId },
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Kind', value: (row) => row.invoiceKind },
  { header: 'Posted at', value: (row) => row.postedAt },
  { header: 'Subtotal', value: (row) => row.subtotal },
  { header: 'Discount', value: (row) => row.discount },
  { header: 'Taxable base', value: (row) => row.taxableBase },
  { header: 'Tax', value: (row) => row.tax },
  { header: 'Total', value: (row) => row.total }
];

const PAYMENT_LEDGER_CSV_COLUMNS: CsvColumn<PaymentLedgerExportRow>[] = [
  { header: 'Payment ID', value: (row) => row.paymentId },
  { header: 'Invoice IDs', value: (row) => row.invoiceIds.join('; ') },
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Amount', value: (row) => row.amount },
  { header: 'Method', value: (row) => row.method },
  { header: 'Source', value: (row) => row.source },
  { header: 'Received at', value: (row) => row.receivedAt },
  { header: 'Reference', value: (row) => row.reference ?? '' },
  { header: 'Memo', value: (row) => row.memo ?? '' },
  { header: 'Recorded by', value: (row) => row.recordedByName },
  { header: 'Provider', value: (row) => row.provider ?? '' },
  { header: 'Provider payment ID', value: (row) => row.providerPaymentId ?? '' },
  { header: 'Processor fee', value: (row) => row.processorFee ?? '' },
  { header: 'BellField fee', value: (row) => row.applicationFee ?? '' },
  { header: 'Void', value: (row) => (row.isVoid ? 'yes' : 'no') },
  { header: 'Voided at', value: (row) => row.voidedAt ?? '' },
  { header: 'Void reason', value: (row) => row.voidReason ?? '' }
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

  /** AR aging by oldest posted invoice date. Gate: reports:view + invoices:view. */
  async getArAging(sessionToken: string): Promise<ArAgingReport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, ['invoices:view']);
    return this.buildArAging();
  }

  /** AR aging CSV export. Gate: reports:view + invoices:view + reports:export. */
  async exportArAging(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'invoices:view',
      'reports:export'
    ]);
    const report = await this.buildArAging();
    return {
      filename: `ar-aging-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(AR_AGING_CSV_COLUMNS, report.rows)
    };
  }

  /** Sales-tax summary over posted invoice records. Gate: reports:view + invoices:view. */
  async getSalesTaxSummary(sessionToken: string): Promise<SalesTaxSummaryReport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, ['invoices:view']);
    return this.buildSalesTaxSummary();
  }

  /** Sales-tax summary CSV export. Gate: reports:view + invoices:view + reports:export. */
  async exportSalesTaxSummary(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'invoices:view',
      'reports:export'
    ]);
    const report = await this.buildSalesTaxSummary();
    return {
      filename: `sales-tax-summary-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(SALES_TAX_CSV_COLUMNS, report.rows)
    };
  }

  /** Posted invoice CSV export. Gate: reports:view + invoices:view + reports:export. */
  async exportPostedInvoices(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'invoices:view',
      'reports:export'
    ]);
    const rows = await this.queryPostedInvoiceExportRows();
    const date = new Date().toISOString().slice(0, 10);
    return {
      filename: `posted-invoices-${date}.csv`,
      csv: toCsv(POSTED_INVOICE_CSV_COLUMNS, rows)
    };
  }

  /** Payment ledger CSV export. Gate: reports:view + payments:view + reports:export. */
  async exportPaymentLedger(sessionToken: string): Promise<ReportCsvExport> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'payments:view',
      'reports:export'
    ]);
    const rows = await this.queryPaymentLedgerExportRows();
    const date = new Date().toISOString().slice(0, 10);
    return {
      filename: `payment-ledger-${date}.csv`,
      csv: toCsv(PAYMENT_LEDGER_CSV_COLUMNS, rows)
    };
  }

  /** Service agreement reporting bundle. Gate: reports:view + agreements:view. */
  async getServiceAgreementReports(sessionToken: string): Promise<ServiceAgreementReports> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, ['agreements:view']);
    return buildServiceAgreementReports(this.databaseService);
  }

  async exportActiveServiceAgreements(sessionToken: string): Promise<ReportCsvExport> {
    const report = await this.getExportableServiceAgreementReports(sessionToken);
    return {
      filename: `service-agreements-active-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(SERVICE_AGREEMENT_ACTIVE_CSV_COLUMNS, report.activeAgreements)
    };
  }

  async exportExpiringServiceAgreements(sessionToken: string): Promise<ReportCsvExport> {
    const report = await this.getExportableServiceAgreementReports(sessionToken);
    return {
      filename: `service-agreements-expiring-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(SERVICE_AGREEMENT_EXPIRING_CSV_COLUMNS, report.expiringSoon)
    };
  }

  async exportServiceAgreementBillingDue(sessionToken: string): Promise<ReportCsvExport> {
    const report = await this.getExportableServiceAgreementReports(sessionToken);
    return {
      filename: `service-agreements-billing-due-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(SERVICE_AGREEMENT_BILLING_CSV_COLUMNS, report.nextBillingDue)
    };
  }

  async exportServiceAgreementVisitTemplatePrompts(sessionToken: string): Promise<ReportCsvExport> {
    const report = await this.getExportableServiceAgreementReports(sessionToken);
    return {
      filename: `service-agreement-visit-prompts-${report.generatedAt.slice(0, 10)}.csv`,
      csv: toCsv(SERVICE_AGREEMENT_VISIT_TEMPLATE_CSV_COLUMNS, report.visitTemplatePrompts)
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

  private async buildArAging(): Promise<ArAgingReport> {
    const rows = await this.queryArAgingRows();
    const totals: ArAgingReport['totals'] = {
      jobCount: rows.length,
      current: 0,
      days31To60: 0,
      days61To90: 0,
      over90: 0,
      amountDue: 0
    };

    for (const row of rows) {
      totals[row.bucket] = roundMoney(totals[row.bucket] + row.amountDue);
      totals.amountDue = roundMoney(totals.amountDue + row.amountDue);
    }

    return { generatedAt: new Date().toISOString(), totals, rows };
  }

  private async getExportableServiceAgreementReports(
    sessionToken: string
  ): Promise<ServiceAgreementReports> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'reports:view',
      ['office-web']
    );
    this.requireSecondaryPermissions(employee.effectivePermissions, [
      'agreements:view',
      'reports:export'
    ]);
    return buildServiceAgreementReports(this.databaseService);
  }

  private async queryArAgingRows(): Promise<ArAgingReport['rows']> {
    const result = await this.databaseService.query<{
      jobId: string;
      jobNumber: string;
      customerName: string;
      oldestPostedAt: string | Date;
      amountDue: string | number;
    }>(
      `with billed as (
         select
           i.job_id,
           sum(
             case
               when i.status = 'posted' and i.invoice_kind in ('main', 'adjustment') then i.total_amount
               when i.status = 'posted' and i.invoice_kind = 'credit' then -i.total_amount
               else 0
             end
           ) as net_billed,
           min(i.posted_at) filter (where i.status = 'posted') as oldest_posted_at
         from invoices i
         group by i.job_id
       ),
       paid as (
         select p.job_id, coalesce(sum(p.amount), 0) as paid_total
         from payments p
         where p.is_void = false
         group by p.job_id
       )
       select
         j.id as "jobId",
         j.job_number as "jobNumber",
         c.name as "customerName",
         b.oldest_posted_at as "oldestPostedAt",
         coalesce(b.net_billed, 0) - coalesce(pd.paid_total, 0) as "amountDue"
       from billed b
       join jobs j on j.id = b.job_id
       join customers c on c.id = j.bill_to_customer_id
       left join paid pd on pd.job_id = b.job_id
       where coalesce(b.net_billed, 0) - coalesce(pd.paid_total, 0) > 0
         and b.oldest_posted_at is not null
       order by "amountDue" desc`
    );

    const today = Date.now();
    return result.rows.map((row) => {
      const oldestPostedAt = new Date(row.oldestPostedAt).toISOString();
      const daysOld = Math.max(
        0,
        Math.floor((today - new Date(oldestPostedAt).getTime()) / (1000 * 60 * 60 * 24))
      );
      return {
        jobId: row.jobId,
        jobNumber: row.jobNumber,
        customerName: row.customerName,
        oldestPostedAt,
        daysOld,
        amountDue: roundMoney(row.amountDue),
        bucket: getAgingBucket(daysOld)
      };
    });
  }

  private async buildSalesTaxSummary(): Promise<SalesTaxSummaryReport> {
    const result = await this.databaseService.query<{
      taxRateBasisPoints: number;
      invoiceCount: string | number;
      taxableBase: string | number;
      tax: string | number;
      total: string | number;
    }>(
      `select
         tax_rate_basis_points as "taxRateBasisPoints",
         count(*) as "invoiceCount",
         coalesce(sum(case when invoice_kind = 'credit' then -taxable_base_amount else taxable_base_amount end), 0) as "taxableBase",
         coalesce(sum(case when invoice_kind = 'credit' then -tax_amount else tax_amount end), 0) as "tax",
         coalesce(sum(case when invoice_kind = 'credit' then -total_amount else total_amount end), 0) as "total"
       from invoices
       where status = 'posted'
       group by tax_rate_basis_points
       order by tax_rate_basis_points asc`
    );

    const rows = result.rows.map((row) => ({
      taxRateBasisPoints: row.taxRateBasisPoints,
      invoiceCount: Number(row.invoiceCount),
      taxableBase: roundMoney(row.taxableBase),
      tax: roundMoney(row.tax),
      total: roundMoney(row.total)
    }));
    const totals = rows.reduce(
      (acc, row) => ({
        invoiceCount: acc.invoiceCount + row.invoiceCount,
        taxableBase: roundMoney(acc.taxableBase + row.taxableBase),
        tax: roundMoney(acc.tax + row.tax),
        total: roundMoney(acc.total + row.total)
      }),
      { invoiceCount: 0, taxableBase: 0, tax: 0, total: 0 }
    );

    return { generatedAt: new Date().toISOString(), totals, rows };
  }

  private async queryPostedInvoiceExportRows(): Promise<PostedInvoiceExportRow[]> {
    const result = await this.databaseService.query<{
      invoiceId: string;
      jobId: string;
      jobNumber: string;
      customerName: string;
      invoiceKind: PostedInvoiceExportRow['invoiceKind'];
      postedAt: string | Date;
      subtotal: string | number;
      discount: string | number;
      taxableBase: string | number;
      tax: string | number;
      total: string | number;
    }>(
      `select
         i.id as "invoiceId",
         i.job_id as "jobId",
         j.job_number as "jobNumber",
         c.name as "customerName",
         i.invoice_kind as "invoiceKind",
         i.posted_at as "postedAt",
         i.subtotal_amount as "subtotal",
         i.discount_amount_applied as "discount",
         i.taxable_base_amount as "taxableBase",
         i.tax_amount as "tax",
         i.total_amount as "total"
       from invoices i
       join jobs j on j.id = i.job_id
       join customers c on c.id = j.bill_to_customer_id
       where i.status = 'posted'
       order by i.posted_at desc, i.id asc`
    );

    return result.rows.map((row) => ({
      invoiceId: row.invoiceId,
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      customerName: row.customerName,
      invoiceKind: row.invoiceKind,
      postedAt: new Date(row.postedAt).toISOString(),
      subtotal: roundMoney(row.subtotal),
      discount: roundMoney(row.discount),
      taxableBase: roundMoney(row.taxableBase),
      tax: roundMoney(row.tax),
      total: roundMoney(row.total)
    }));
  }

  private async queryPaymentLedgerExportRows(): Promise<PaymentLedgerExportRow[]> {
    const result = await this.databaseService.query<{
      paymentId: string;
      invoiceIds: string[] | null;
      jobId: string;
      jobNumber: string;
      customerName: string;
      amount: string | number;
      method: string;
      source: 'manual' | 'bellfield_payments';
      receivedAt: string | Date;
      reference: string | null;
      memo: string | null;
      recordedByName: string;
      provider: string | null;
      providerPaymentId: string | null;
      processorFee: string | number | null;
      applicationFee: string | number | null;
      isVoid: boolean;
      voidedAt: string | Date | null;
      voidReason: string | null;
    }>(
      `select
         p.id as "paymentId",
         array_remove(array_agg(pa.invoice_id order by pa.invoice_id), null) as "invoiceIds",
         p.job_id as "jobId",
         j.job_number as "jobNumber",
         c.name as "customerName",
         p.amount,
         p.method,
         p.source,
         p.received_at as "receivedAt",
         p.reference,
         p.memo,
         p.recorded_by_name as "recordedByName",
         p.provider,
         p.provider_payment_id as "providerPaymentId",
         p.processor_fee_amount as "processorFee",
         p.application_fee_amount as "applicationFee",
         p.is_void as "isVoid",
         p.voided_at as "voidedAt",
         p.void_reason as "voidReason"
       from payments p
       join jobs j on j.id = p.job_id
       join customers c on c.id = j.bill_to_customer_id
       left join payment_allocations pa on pa.payment_id = p.id
       group by
         p.id, p.job_id, j.job_number, c.name, p.amount, p.method, p.source,
         p.received_at, p.reference, p.memo, p.recorded_by_name, p.provider,
         p.provider_payment_id, p.processor_fee_amount, p.application_fee_amount,
         p.is_void, p.voided_at, p.void_reason
       order by p.received_at desc, p.id asc`
    );

    return result.rows.map((row) => ({
      paymentId: row.paymentId,
      invoiceIds: row.invoiceIds ?? [],
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      customerName: row.customerName,
      amount: roundMoney(row.amount),
      method: row.method,
      source: row.source === 'bellfield_payments' ? 'bellfieldPayments' : 'manual',
      receivedAt: new Date(row.receivedAt).toISOString(),
      reference: row.reference ?? undefined,
      memo: row.memo ?? undefined,
      recordedByName: row.recordedByName,
      provider: row.provider ?? undefined,
      providerPaymentId: row.providerPaymentId ?? undefined,
      processorFee: row.processorFee === null ? undefined : roundMoney(row.processorFee),
      applicationFee: row.applicationFee === null ? undefined : roundMoney(row.applicationFee),
      isVoid: row.isVoid,
      voidedAt: row.voidedAt ? new Date(row.voidedAt).toISOString() : undefined,
      voidReason: row.voidReason ?? undefined
    }));
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

function getAgingBucket(daysOld: number): ArAgingReport['rows'][number]['bucket'] {
  if (daysOld <= 30) return 'current';
  if (daysOld <= 60) return 'days31To60';
  if (daysOld <= 90) return 'days61To90';
  return 'over90';
}
