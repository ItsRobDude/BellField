import { randomUUID } from 'node:crypto';
import { priceEstimate, type EstimatePricingLine } from '@bellfield/estimating';
import type { QueryExecutor } from '../../database/database.service';
import { insertJobTimelineEntry } from './jobs-data-repository-utils';

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

type MainInvoiceContext = { id: string; status: 'draft' | 'posted' };

/** Load the job's main invoice id AND status, locking the row for the rest of the
 * transaction. Reflection must know the status so it never writes to a posted (locked)
 * invoice; the `for update` lock makes that race-proof — once we read 'draft' here, a
 * concurrent post blocks until this register transaction commits. */
async function getMainInvoiceContext(
  jobId: string,
  queryable: QueryExecutor
): Promise<MainInvoiceContext | null> {
  const result = await queryable.query<MainInvoiceContext>(
    `select id, status from invoices where job_id = $1 and invoice_kind = 'main' limit 1 for update`,
    [jobId]
  );
  return result.rows[0] ?? null;
}

/**
 * True when this register entry still has a linked, non-void invoice line — i.e. it had
 * reflected onto the invoice and a change to it would otherwise have flowed through. Used
 * on the posted branch to decide whether a "not reflected" note is warranted: a detached
 * (office-edited) or never-linked entry would not reflect even on a draft, so noting it
 * would mislead.
 */
async function hasLinkedInvoiceLine(
  registerEntryId: string,
  queryable: QueryExecutor
): Promise<boolean> {
  const result = await queryable.query(
    `select 1 from invoice_line_items
     where source_register_entry_id = $1 and source_sync_state = 'linked' and is_void = false
     limit 1`,
    [registerEntryId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Record on the job timeline that a register change could not flow into the invoice
 * because it is posted/locked. The register entry itself is still saved by the caller;
 * this only surfaces that the locked bill does not include it (it needs an adjustment).
 */
async function insertRegisterNotReflectedNote(
  jobId: string,
  description: string,
  actorName: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, occurredAt]);
  await insertJobTimelineEntry(
    {
      id: randomUUID(),
      jobId,
      occurredAt,
      actorName,
      kind: 'registerEntryNotReflected',
      message: `Register entry "${description}" was saved after the invoice was posted; it was not added to the locked invoice and needs an adjustment.`
    },
    queryable
  );
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
  actorName: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const context = await getMainInvoiceContext(jobId, queryable);
  if (!context) {
    return;
  }
  if (context.status === 'posted') {
    // The invoice is locked. The register entry itself is already saved by the caller;
    // we must not add a line to the posted bill. Record that it was not reflected.
    await insertRegisterNotReflectedNote(
      jobId,
      entry.description,
      actorName,
      occurredAt,
      queryable
    );
    return;
  }

  const position = await nextLinePosition(context.id, queryable);
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
      context.id,
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

  await recalculateInvoiceTotals(context.id, occurredAt, queryable);
}

/**
 * Reflect an edit to a register entry into its linked invoice line. Detached lines
 * (office-edited) are intentionally left untouched. No-op if no linked line exists.
 * Recomputes totals when something changed.
 *
 * The invoice status is resolved BEFORE any line write, so a late edit can never mutate
 * a posted invoice's line. On a posted invoice the edit is dropped and a "not reflected"
 * note is recorded only when the entry actually had a linked line that would have moved.
 */
export async function reflectRegisterEntryUpdate(
  entry: ReflectableRegisterEntry & { jobId: string },
  actorName: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const context = await getMainInvoiceContext(entry.jobId, queryable);
  if (!context) {
    return;
  }
  if (context.status === 'posted') {
    if (await hasLinkedInvoiceLine(entry.id, queryable)) {
      await insertRegisterNotReflectedNote(
        entry.jobId,
        entry.description,
        actorName,
        occurredAt,
        queryable
      );
    }
    return;
  }

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
    await recalculateInvoiceTotals(context.id, occurredAt, queryable);
  }
}

/**
 * Void the linked invoice line when a register entry is voided, then recompute.
 *
 * As with update, the invoice status is resolved BEFORE the line write so a late void
 * can never mutate a posted invoice's line; on a posted invoice the void is dropped and
 * a "not reflected" note is recorded only when a linked line existed.
 */
export async function reflectRegisterEntryVoid(
  registerEntryId: string,
  jobId: string,
  description: string,
  actorName: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  const context = await getMainInvoiceContext(jobId, queryable);
  if (!context) {
    return;
  }
  if (context.status === 'posted') {
    if (await hasLinkedInvoiceLine(registerEntryId, queryable)) {
      await insertRegisterNotReflectedNote(jobId, description, actorName, occurredAt, queryable);
    }
    return;
  }

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
    await recalculateInvoiceTotals(context.id, occurredAt, queryable);
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
