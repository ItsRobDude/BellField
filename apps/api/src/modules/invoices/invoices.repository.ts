import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  InvoiceDiscountValue,
  InvoiceKindValue,
  InvoiceLineItemRecord,
  InvoiceRecord,
  InvoiceStatusValue
} from './invoices.types';

type InvoiceRow = {
  id: string;
  jobId: string;
  invoiceKind: InvoiceKindValue;
  status: InvoiceStatusValue;
  taxRateBasisPoints: number;
  discountKind: 'percent' | 'fixed' | null;
  discountBasisPoints: number | null;
  discountAmount: string | number | null;
  subtotalAmount: string | number;
  discountAmountApplied: string | number;
  taxableBaseAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  totalCostAmount: string | number;
  profitAmount: string | number;
  marginBasisPoints: number | null;
  costComplete: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  version: number;
};

type InvoiceLineItemRow = {
  id: string;
  invoiceId: string;
  position: number;
  kind: InvoiceLineItemRecord['kind'];
  description: string;
  quantity: string | number;
  unitOfMeasure: string | null;
  unitPrice: string | number;
  unitCost: string | number | null;
  taxable: boolean;
  partNumber: string | null;
  inventorySourceLabel: string | null;
  lineSubtotal: string | number;
  lineCost: string | number | null;
  sourceKind: InvoiceLineItemRecord['sourceKind'];
  sourceSyncState: InvoiceLineItemRecord['sourceSyncState'];
  createdAt: string | Date;
  updatedAt: string | Date;
};

const INVOICE_COLUMNS = `
  id,
  job_id as "jobId",
  invoice_kind as "invoiceKind",
  status,
  tax_rate_basis_points as "taxRateBasisPoints",
  discount_kind as "discountKind",
  discount_basis_points as "discountBasisPoints",
  discount_amount as "discountAmount",
  subtotal_amount as "subtotalAmount",
  discount_amount_applied as "discountAmountApplied",
  taxable_base_amount as "taxableBaseAmount",
  tax_amount as "taxAmount",
  total_amount as "totalAmount",
  total_cost_amount as "totalCostAmount",
  profit_amount as "profitAmount",
  margin_basis_points as "marginBasisPoints",
  cost_complete as "costComplete",
  created_at as "createdAt",
  updated_at as "updatedAt",
  version
`;

const INVOICE_LINE_COLUMNS = `
  id,
  invoice_id as "invoiceId",
  line_position as "position",
  kind,
  description,
  quantity,
  unit_of_measure as "unitOfMeasure",
  unit_price as "unitPrice",
  unit_cost as "unitCost",
  taxable,
  part_number as "partNumber",
  inventory_source_label as "inventorySourceLabel",
  line_subtotal_amount as "lineSubtotal",
  line_cost_amount as "lineCost",
  source_kind as "sourceKind",
  source_sync_state as "sourceSyncState",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

@Injectable()
export class InvoicesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Load the single main invoice draft for a job, including its active (non-void) lines. */
  async getMainInvoiceForJob(jobId: string): Promise<InvoiceRecord | null> {
    const invoiceResult = await this.databaseService.query<InvoiceRow>(
      `select ${INVOICE_COLUMNS} from invoices where job_id = $1 and invoice_kind = 'main' limit 1`,
      [jobId]
    );

    const row = invoiceResult.rows[0];
    if (!row) {
      return null;
    }

    const lineResult = await this.databaseService.query<InvoiceLineItemRow>(
      `select ${INVOICE_LINE_COLUMNS} from invoice_line_items
       where invoice_id = $1 and is_void = false
       order by line_position asc`,
      [row.id]
    );

    return this.toInvoiceRecord(
      row,
      lineResult.rows.map((lineRow) => this.toLineItemRecord(lineRow))
    );
  }

  private toInvoiceRecord(row: InvoiceRow, lineItems: InvoiceLineItemRecord[]): InvoiceRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      invoiceKind: row.invoiceKind,
      status: row.status,
      taxRateBasisPoints: row.taxRateBasisPoints,
      discount: toDiscount(row),
      lineItems,
      totals: {
        subtotal: Number(row.subtotalAmount),
        discount: Number(row.discountAmountApplied),
        taxableBase: Number(row.taxableBaseAmount),
        tax: Number(row.taxAmount),
        total: Number(row.totalAmount),
        totalCost: Number(row.totalCostAmount),
        profit: Number(row.profitAmount),
        marginBasisPoints: row.marginBasisPoints === null ? null : Number(row.marginBasisPoints),
        costComplete: row.costComplete
      },
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
      version: row.version
    };
  }

  private toLineItemRecord(row: InvoiceLineItemRow): InvoiceLineItemRecord {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      position: row.position,
      kind: row.kind,
      description: row.description,
      quantity: Number(row.quantity),
      unitOfMeasure: row.unitOfMeasure ?? undefined,
      unitPrice: Number(row.unitPrice),
      unitCost: row.unitCost === null ? undefined : Number(row.unitCost),
      taxable: row.taxable,
      partNumber: row.partNumber ?? undefined,
      inventorySourceLabel: row.inventorySourceLabel ?? undefined,
      lineSubtotal: Number(row.lineSubtotal),
      lineCost: row.lineCost === null ? undefined : Number(row.lineCost),
      sourceKind: row.sourceKind,
      sourceSyncState: row.sourceSyncState,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }
}

function toDiscount(row: InvoiceRow): InvoiceDiscountValue | undefined {
  if (row.discountKind === 'percent' && row.discountBasisPoints !== null) {
    return { kind: 'percent', basisPoints: row.discountBasisPoints };
  }
  if (row.discountKind === 'fixed' && row.discountAmount !== null) {
    return { kind: 'fixed', amount: Number(row.discountAmount) };
  }
  return undefined;
}
