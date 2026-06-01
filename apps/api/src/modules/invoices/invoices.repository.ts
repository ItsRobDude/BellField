import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { recalculateInvoiceTotals } from '../company-data/invoice-reflection-utils';
import type {
  InvoiceDiscountValue,
  InvoiceKindValue,
  InvoiceLineItemRecord,
  InvoiceRecord,
  InvoiceStatusValue
} from './invoices.types';

/** A manual invoice line as the office supplies it (server computes the rest). */
export type InvoiceLineWriteInput = {
  kind: InvoiceLineItemRecord['kind'];
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
};

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

  // --- Office line editing -------------------------------------------------

  /** Look up one active invoice line plus the status of its owning invoice. */
  async getActiveLineContext(lineId: string): Promise<{
    lineId: string;
    invoiceId: string;
    jobId: string;
    invoiceStatus: InvoiceStatusValue;
    sourceSyncState: InvoiceLineItemRecord['sourceSyncState'];
  } | null> {
    const result = await this.databaseService.query<{
      lineId: string;
      invoiceId: string;
      jobId: string;
      invoiceStatus: InvoiceStatusValue;
      sourceSyncState: InvoiceLineItemRecord['sourceSyncState'];
    }>(
      `select
         ili.id as "lineId",
         ili.invoice_id as "invoiceId",
         inv.job_id as "jobId",
         inv.status as "invoiceStatus",
         ili.source_sync_state as "sourceSyncState"
       from invoice_line_items ili
       join invoices inv on inv.id = ili.invoice_id
       where ili.id = $1 and ili.is_void = false
       limit 1`,
      [lineId]
    );
    return result.rows[0] ?? null;
  }

  /** Add a manual office line to a job's main draft, then recompute totals. */
  async addManualLine(jobId: string, input: InvoiceLineWriteInput): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      const invoiceResult = await queryable.query<{ id: string }>(
        `select id from invoices where job_id = $1 and invoice_kind = 'main' limit 1`,
        [jobId]
      );
      const invoiceId = invoiceResult.rows[0]?.id;
      if (!invoiceId) {
        throw new Error('Job has no main invoice draft.');
      }

      const positionResult = await queryable.query<{ nextPosition: number }>(
        `select coalesce(max(line_position) + 1, 0) as "nextPosition"
         from invoice_line_items where invoice_id = $1 and is_void = false`,
        [invoiceId]
      );
      const position = Number(positionResult.rows[0]?.nextPosition ?? 0);

      await queryable.query(
        `insert into invoice_line_items (
           id, invoice_id, line_position, kind, description, quantity, unit_of_measure,
           unit_price, unit_cost, taxable, line_subtotal_amount, line_cost_amount,
           source_kind, source_sync_state, is_void, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 'manual', 'linked', false, $13, $13)`,
        [
          randomUUID(),
          invoiceId,
          position,
          input.kind,
          input.description.trim(),
          input.quantity,
          input.unitOfMeasure?.trim() || null,
          input.unitPrice,
          input.unitCost ?? null,
          input.taxable,
          roundMoney(input.quantity * input.unitPrice),
          input.unitCost === undefined ? null : roundMoney(input.quantity * input.unitCost),
          now
        ]
      );

      await recalculateInvoiceTotals(invoiceId, now, queryable);
    });
  }

  /**
   * Edit an invoice line. If the line was register-sourced and still linked,
   * editing it detaches it so future register changes can't overwrite the
   * billing edit (manual lines are already detached-equivalent).
   */
  async editLine(lineId: string, invoiceId: string, input: InvoiceLineWriteInput): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `update invoice_line_items set
           kind = $2,
           description = $3,
           quantity = $4,
           unit_of_measure = $5,
           unit_price = $6,
           unit_cost = $7,
           taxable = $8,
           line_subtotal_amount = $9,
           line_cost_amount = $10,
           source_sync_state = case when source_kind = 'register' then 'detached' else source_sync_state end,
           updated_at = $11
         where id = $1 and is_void = false`,
        [
          lineId,
          input.kind,
          input.description.trim(),
          input.quantity,
          input.unitOfMeasure?.trim() || null,
          input.unitPrice,
          input.unitCost ?? null,
          input.taxable,
          roundMoney(input.quantity * input.unitPrice),
          input.unitCost === undefined ? null : roundMoney(input.quantity * input.unitCost),
          now
        ]
      );

      await recalculateInvoiceTotals(invoiceId, now, queryable);
    });
  }

  /** Soft-void an invoice line, then recompute totals. */
  async voidLine(lineId: string, invoiceId: string, reason: string | undefined): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `update invoice_line_items set is_void = true, void_reason = $2, updated_at = $3
         where id = $1 and is_void = false`,
        [lineId, reason?.trim() || null, now]
      );

      await recalculateInvoiceTotals(invoiceId, now, queryable);
    });
  }
}

/** Round decimal-dollar money to whole cents (mirrors the engine's edge rounding). */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
