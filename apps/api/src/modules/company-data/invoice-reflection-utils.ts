import { randomUUID } from 'node:crypto';
import { priceEstimate, type EstimatePricingLine } from '@bellfield/estimating';
import type { QueryExecutor } from '../../database/database.service';

// Register-to-invoice reflection, shared by the register write paths.
//
// The product rule is that register entries "reflect immediately on the invoice
// draft." We do that with durable invoice line rows (not a computed read-model)
// so Milestone 8 posting has a stable snapshot. Each register entry maps to one
// invoice line tagged source_kind='register' and source_register_entry_id, while
// that line is still 'linked'. Once the office hand-edits a reflected line it
// becomes 'detached' and register changes stop flowing into it, so a billing
// correction is never silently overwritten.
//
// A register entry stores a flat, authoritative total_amount (what the customer
// is billed for that line). Invoice lines model unit_price * quantity, so we
// represent a reflected line as quantity 1 at unit_price = the register total.
// That bills exactly the captured amount with no re-derivation or rounding drift.
//
// These helpers run INSIDE the register write transaction (same queryable), so a
// register row and its invoice reflection commit or roll back together.

type InvoiceLinePricingRow = {
  quantity: string | number;
  unitPrice: string | number;
  unitCost: string | number | null;
  taxable: boolean;
};

type ReflectableRegisterEntry = {
  id: string;
  kind: string;
  description: string;
  totalAmount: number;
  unitOfMeasure?: string;
  partNumber?: string;
  inventorySourceLabel?: string;
};

async function getMainInvoiceId(jobId: string, queryable: QueryExecutor): Promise<string | null> {
  const result = await queryable.query<{ id: string }>(
    `select id from invoices where job_id = $1 and invoice_kind = 'main' limit 1`,
    [jobId]
  );
  return result.rows[0]?.id ?? null;
}

async function nextLinePosition(invoiceId: string, queryable: QueryExecutor): Promise<number> {
  const result = await queryable.query<{ nextPosition: number }>(
    `select coalesce(max(line_position) + 1, 0) as "nextPosition"
     from invoice_line_items
     where invoice_id = $1 and is_void = false`,
    [invoiceId]
  );
  return Number(result.rows[0]?.nextPosition ?? 0);
}

/**
 * Recompute and persist an invoice's snapshot totals from its active lines,
 * using the same pricing engine the rest of the system uses. Each active line is
 * priced as quantity * unit_price; tax/discount come from the invoice header.
 */
export async function recalculateInvoiceTotals(
  invoiceId: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const header = await queryable.query<{
    taxRateBasisPoints: number;
    discountKind: 'percent' | 'fixed' | null;
    discountBasisPoints: number | null;
    discountAmount: string | number | null;
  }>(
    `select
       tax_rate_basis_points as "taxRateBasisPoints",
       discount_kind as "discountKind",
       discount_basis_points as "discountBasisPoints",
       discount_amount as "discountAmount"
     from invoices where id = $1`,
    [invoiceId]
  );
  const headerRow = header.rows[0];
  if (!headerRow) {
    return;
  }

  const lineResult = await queryable.query<InvoiceLinePricingRow>(
    `select quantity, unit_price as "unitPrice", unit_cost as "unitCost", taxable
     from invoice_line_items
     where invoice_id = $1 and is_void = false
     order by line_position asc`,
    [invoiceId]
  );

  const lines: EstimatePricingLine[] = lineResult.rows.map((row) => ({
    quantity: Number(row.quantity),
    unitPriceDollars: Number(row.unitPrice),
    unitCostDollars: row.unitCost === null ? undefined : Number(row.unitCost),
    taxable: row.taxable
  }));

  const priced = priceEstimate(lines, {
    taxRateBasisPoints: headerRow.taxRateBasisPoints,
    discount: toEngineDiscount(headerRow)
  });

  await queryable.query(
    `update invoices set
       subtotal_amount = $2,
       discount_amount_applied = $3,
       taxable_base_amount = $4,
       tax_amount = $5,
       total_amount = $6,
       total_cost_amount = $7,
       profit_amount = $8,
       margin_basis_points = $9,
       cost_complete = $10,
       updated_at = $11,
       version = version + 1
     where id = $1`,
    [
      invoiceId,
      priced.subtotalDollars,
      priced.discountDollars,
      priced.taxableBaseDollars,
      priced.taxDollars,
      priced.totalDollars,
      priced.margin.totalCostDollars,
      priced.margin.profitDollars,
      priced.margin.marginBasisPoints,
      priced.margin.costComplete,
      occurredAt
    ]
  );
}

/** Reflect a newly created register entry as a linked invoice line, then recompute totals. */
export async function reflectRegisterEntryCreate(
  jobId: string,
  entry: ReflectableRegisterEntry,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const invoiceId = await getMainInvoiceId(jobId, queryable);
  if (!invoiceId) {
    return;
  }

  const position = await nextLinePosition(invoiceId, queryable);
  await queryable.query(
    `insert into invoice_line_items (
       id, invoice_id, line_position, kind, description, quantity, unit_of_measure,
       unit_price, unit_cost, taxable, part_number, inventory_source_label,
       line_subtotal_amount, line_cost_amount,
       source_kind, source_register_entry_id, source_sync_state,
       is_void, created_at, updated_at
     )
     values ($1, $2, $3, $4, $5, 1, $6, $7, null, true, $8, $9, $7, null,
             'register', $10, 'linked', false, $11, $11)`,
    [
      randomUUID(),
      invoiceId,
      position,
      entry.kind,
      entry.description,
      entry.unitOfMeasure ?? null,
      entry.totalAmount,
      entry.partNumber ?? null,
      entry.inventorySourceLabel ?? null,
      entry.id,
      occurredAt
    ]
  );

  await recalculateInvoiceTotals(invoiceId, occurredAt, queryable);
}

/**
 * Reflect an edit to a register entry into its linked invoice line. Detached
 * lines (office-edited) are intentionally left untouched. No-op if no linked
 * line exists. Recomputes totals when something changed.
 */
export async function reflectRegisterEntryUpdate(
  entry: ReflectableRegisterEntry & { jobId: string },
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const updateResult = await queryable.query(
    `update invoice_line_items set
       kind = $2,
       description = $3,
       unit_of_measure = $4,
       unit_price = $5,
       line_subtotal_amount = $5,
       part_number = $6,
       inventory_source_label = $7,
       updated_at = $8
     where source_register_entry_id = $1
       and source_sync_state = 'linked'
       and is_void = false`,
    [
      entry.id,
      entry.kind,
      entry.description,
      entry.unitOfMeasure ?? null,
      entry.totalAmount,
      entry.partNumber ?? null,
      entry.inventorySourceLabel ?? null,
      occurredAt
    ]
  );

  if ((updateResult.rowCount ?? 0) > 0) {
    const invoiceId = await getMainInvoiceId(entry.jobId, queryable);
    if (invoiceId) {
      await recalculateInvoiceTotals(invoiceId, occurredAt, queryable);
    }
  }
}

/** Void the linked invoice line when a register entry is voided, then recompute. */
export async function reflectRegisterEntryVoid(
  registerEntryId: string,
  jobId: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const voidResult = await queryable.query(
    `update invoice_line_items set
       is_void = true,
       void_reason = 'Source register entry voided.',
       updated_at = $2
     where source_register_entry_id = $1
       and source_sync_state = 'linked'
       and is_void = false`,
    [registerEntryId, occurredAt]
  );

  if ((voidResult.rowCount ?? 0) > 0) {
    const invoiceId = await getMainInvoiceId(jobId, queryable);
    if (invoiceId) {
      await recalculateInvoiceTotals(invoiceId, occurredAt, queryable);
    }
  }
}

function toEngineDiscount(row: {
  discountKind: 'percent' | 'fixed' | null;
  discountBasisPoints: number | null;
  discountAmount: string | number | null;
}) {
  if (row.discountKind === 'percent' && row.discountBasisPoints !== null) {
    return { kind: 'percent' as const, basisPoints: row.discountBasisPoints };
  }
  if (row.discountKind === 'fixed' && row.discountAmount !== null) {
    return { kind: 'fixed' as const, amountDollars: Number(row.discountAmount) };
  }
  return undefined;
}
