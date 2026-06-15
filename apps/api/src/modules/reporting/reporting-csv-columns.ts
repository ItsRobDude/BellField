import type {
  ArAgingReport,
  ArOpenBalancesReport,
  InventoryValuationReport,
  JobProfitabilityReport,
  PaymentLedgerExportRow,
  PostedInvoiceExportRow,
  SalesTaxSummaryReport
} from '@bellfield/contracts';
import type { CsvColumn } from './report-csv';

// Pure CSV column definitions for the fixed business reports, extracted from
// reporting.service.ts to keep that file under the source-size guardrail
// (mirrors how the service-agreement report columns already live on their own).

export const AR_CSV_COLUMNS: CsvColumn<ArOpenBalancesReport['rows'][number]>[] = [
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Net billed', value: (row) => row.netBilled },
  { header: 'Paid', value: (row) => row.paidTotal },
  { header: 'Amount due', value: (row) => row.amountDue }
];

export const AR_AGING_CSV_COLUMNS: CsvColumn<ArAgingReport['rows'][number]>[] = [
  { header: 'Job #', value: (row) => row.jobNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Oldest posted', value: (row) => row.oldestPostedAt.slice(0, 10) },
  { header: 'Days old', value: (row) => row.daysOld },
  { header: 'Bucket', value: (row) => row.bucket },
  { header: 'Amount due', value: (row) => row.amountDue }
];

export const SALES_TAX_CSV_COLUMNS: CsvColumn<SalesTaxSummaryReport['rows'][number]>[] = [
  { header: 'Tax rate bps', value: (row) => row.taxRateBasisPoints },
  { header: 'Invoice count', value: (row) => row.invoiceCount },
  { header: 'Taxable base', value: (row) => row.taxableBase },
  { header: 'Tax', value: (row) => row.tax },
  { header: 'Total', value: (row) => row.total }
];

export const POSTED_INVOICE_CSV_COLUMNS: CsvColumn<PostedInvoiceExportRow>[] = [
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

export const PAYMENT_LEDGER_CSV_COLUMNS: CsvColumn<PaymentLedgerExportRow>[] = [
  { header: 'Entry type', value: (row) => row.entryType },
  { header: 'Entry ID', value: (row) => row.entryId },
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
  { header: 'Provider transaction ID', value: (row) => row.providerTransactionId ?? '' },
  { header: 'Processor fee', value: (row) => row.processorFee ?? '' },
  { header: 'BellField fee', value: (row) => row.applicationFee ?? '' },
  { header: 'Void', value: (row) => (row.isVoid ? 'yes' : 'no') },
  { header: 'Voided at', value: (row) => row.voidedAt ?? '' },
  { header: 'Void reason', value: (row) => row.voidReason ?? '' }
];

export const PROFITABILITY_CSV_COLUMNS: CsvColumn<JobProfitabilityReport['rows'][number]>[] = [
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

export const INVENTORY_CSV_COLUMNS: CsvColumn<InventoryValuationReport['rows'][number]>[] = [
  { header: 'Item', value: (row) => row.itemName },
  { header: 'Kind', value: (row) => row.itemKind },
  { header: 'Location', value: (row) => row.locationName },
  { header: 'Quantity', value: (row) => row.quantity },
  { header: 'Avg unit cost', value: (row) => row.averageUnitCost },
  { header: 'Total value', value: (row) => row.totalValue }
];
