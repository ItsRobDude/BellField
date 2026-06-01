import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type { PostedInvoiceContext } from '@bellfield/contracts';
import { recalculateInvoiceTotals } from '../company-data/invoice-reflection-utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type {
  InvoiceDiscountValue,
  InvoiceKindValue,
  InvoiceLineItemRecord,
  InvoiceRecord,
  InvoiceStatusValue,
  PostedSnapshotInput
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

/** How conversion treats lines already on the draft. */
export type EstimateConversionMode = 'append' | 'replace';

/** A snapshot line copied from an approved estimate during conversion. */
export type EstimateConversionLine = {
  estimateLineItemId: string;
  kind: InvoiceLineItemRecord['kind'];
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
  /** Frozen per-line subtotal from the approved estimate snapshot (copied, not re-derived). */
  lineSubtotal: number;
  lineCost?: number;
};

/** The approved estimate snapshot conversion copies into the draft. */
export type EstimateConversionInput = {
  estimateId: string;
  estimateTitle: string;
  taxRateBasisPoints: number;
  discount?: InvoiceDiscountValue;
  lines: EstimateConversionLine[];
  actor: { id: string; displayName: string };
};

/** Result of an atomic conversion: the invoice the estimate was converted into. */
export type EstimateConversionResult = { invoiceId: string };

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
  // Posted display-context snapshot; all null until the invoice is posted.
  postedAt: string | Date | null;
  postedByName: string | null;
  billToCustomerId: string | null;
  billToCustomerName: string | null;
  billToAccountType: string | null;
  billToAddressLine1: string | null;
  billToCity: string | null;
  billToState: string | null;
  billToPostalCode: string | null;
  serviceLocationId: string | null;
  serviceLocationName: string | null;
  serviceLocationAddressLine1: string | null;
  serviceLocationCity: string | null;
  serviceLocationState: string | null;
  serviceLocationPostalCode: string | null;
  jobNumber: string | null;
  workOrderNumber: string | null;
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
  version,
  posted_at as "postedAt",
  posted_by_name as "postedByName",
  bill_to_customer_id as "billToCustomerId",
  bill_to_customer_name as "billToCustomerName",
  bill_to_account_type as "billToAccountType",
  bill_to_address_line1 as "billToAddressLine1",
  bill_to_city as "billToCity",
  bill_to_state as "billToState",
  bill_to_postal_code as "billToPostalCode",
  service_location_id as "serviceLocationId",
  service_location_name as "serviceLocationName",
  service_location_address_line1 as "serviceLocationAddressLine1",
  service_location_city as "serviceLocationCity",
  service_location_state as "serviceLocationState",
  service_location_postal_code as "serviceLocationPostalCode",
  job_number as "jobNumber",
  work_order_number as "workOrderNumber"
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
      posted: toPostedContext(row),
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

  // --- Posted-lock helpers -------------------------------------------------

  /**
   * Lock the job's main invoice row for the rest of the transaction and return it.
   * The `for update` row lock is what makes the posted-lock race-proof: a mutator that
   * reads 'draft' here holds the row until commit, so a concurrent post cannot slip in
   * between the read and the writes. (The service-layer status check is only a friendlier
   * early error; this lock + re-check is the authoritative boundary.)
   */
  private async lockMainInvoiceByJob(
    jobId: string,
    queryable: QueryExecutor
  ): Promise<{ id: string; status: InvoiceStatusValue }> {
    const result = await queryable.query<{ id: string; status: InvoiceStatusValue }>(
      `select id, status from invoices
       where job_id = $1 and invoice_kind = 'main'
       limit 1
       for update`,
      [jobId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Job has no main invoice draft.');
    }
    return row;
  }

  /** Lock a specific invoice row by id for the transaction and return its status. */
  private async lockInvoiceStatusById(
    invoiceId: string,
    queryable: QueryExecutor
  ): Promise<InvoiceStatusValue> {
    const result = await queryable.query<{ status: InvoiceStatusValue }>(
      `select status from invoices where id = $1 limit 1 for update`,
      [invoiceId]
    );
    const status = result.rows[0]?.status;
    if (!status) {
      throw new Error('Invoice not found.');
    }
    return status;
  }

  private ensureDraftRow(status: InvoiceStatusValue): void {
    if (status !== 'draft') {
      throw new ConflictException('This invoice is posted and locked; it can no longer be edited.');
    }
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
      // Lock the invoice row and re-check it is a draft, so a concurrent post cannot
      // land a manual line on a now-posted invoice.
      const invoice = await this.lockMainInvoiceByJob(jobId, queryable);
      this.ensureDraftRow(invoice.status);
      const invoiceId = invoice.id;

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
      // Lock the owning invoice and re-check draft before mutating the line, so a
      // concurrent post cannot be edited around.
      this.ensureDraftRow(await this.lockInvoiceStatusById(invoiceId, queryable));
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
      // Lock the owning invoice and re-check draft before voiding the line.
      this.ensureDraftRow(await this.lockInvoiceStatusById(invoiceId, queryable));
      await queryable.query(
        `update invoice_line_items set is_void = true, void_reason = $2, updated_at = $3
         where id = $1 and is_void = false`,
        [lineId, reason?.trim() || null, now]
      );

      await recalculateInvoiceTotals(invoiceId, now, queryable);
    });
  }

  // --- Posting -------------------------------------------------------------

  /**
   * Post a job's main draft invoice: lock it and freeze the customer/location/job
   * display-context snapshot, atomically. The guarded `where ... and status = 'draft'`
   * makes this safe against a concurrent post or any in-flight edit — only a draft
   * transitions, and a second attempt changes zero rows and is rejected (mirrors the
   * estimate approve/decline guard). Money is NOT recomputed here: totals already froze
   * on write, so posting only freezes who/where the bill was for, stamps the audit
   * columns + timeline, and bumps version.
   */
  async postInvoice(
    jobId: string,
    snapshot: PostedSnapshotInput,
    actor: { id: string; displayName: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      const result = await queryable.query(
        `update invoices set
           status = 'posted',
           posted_at = $2,
           posted_by_employee_id = $3,
           posted_by_name = $4,
           bill_to_customer_id = $5,
           bill_to_customer_name = $6,
           bill_to_account_type = $7,
           bill_to_address_line1 = $8,
           bill_to_city = $9,
           bill_to_state = $10,
           bill_to_postal_code = $11,
           service_location_id = $12,
           service_location_name = $13,
           service_location_address_line1 = $14,
           service_location_city = $15,
           service_location_state = $16,
           service_location_postal_code = $17,
           job_number = $18,
           work_order_number = $19,
           updated_at = $2,
           version = version + 1
         where job_id = $1 and invoice_kind = 'main' and status = 'draft'`,
        [
          jobId,
          now,
          actor.id,
          actor.displayName,
          snapshot.billToCustomerId,
          snapshot.billToCustomerName,
          snapshot.billToAccountType,
          snapshot.billToAddressLine1,
          snapshot.billToCity,
          snapshot.billToState,
          snapshot.billToPostalCode,
          snapshot.serviceLocationId,
          snapshot.serviceLocationName,
          snapshot.serviceLocationAddressLine1,
          snapshot.serviceLocationCity,
          snapshot.serviceLocationState,
          snapshot.serviceLocationPostalCode,
          snapshot.jobNumber,
          snapshot.workOrderNumber ?? null
        ]
      );

      if (result.rowCount === 0) {
        // Either there is no main invoice (a data-integrity gap the service pre-check
        // would already have surfaced) or it is no longer a draft (already posted).
        throw new ConflictException('This invoice is no longer a draft and cannot be posted.');
      }

      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, now]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: now,
          actorName: actor.displayName,
          kind: 'invoicePosted',
          message: 'Invoice posted. The bill is now locked.'
        },
        queryable
      );
    });
  }

  /** Count active lines on a job's main draft (used to decide block-with-choice on conversion). */
  async countActiveLines(jobId: string): Promise<number> {
    const result = await this.databaseService.query<{ count: string | number }>(
      `select count(*) as count
       from invoice_line_items ili
       join invoices inv on inv.id = ili.invoice_id
       where inv.job_id = $1 and inv.invoice_kind = 'main' and ili.is_void = false`,
      [jobId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Atomically convert an approved estimate's snapshot into the job's main
   * invoice draft. The whole operation — claiming the estimate, voiding existing
   * lines (replace mode), copying lines, stamping audit/timeline, recomputing
   * totals — runs in ONE transaction so it cannot partially apply, and the
   * estimate claim is a guarded update (`where converted_to_invoice_id is null
   * and status = 'approved'`) so concurrent or repeat conversions are rejected
   * by the database, not just by an earlier read.
   *
   * Tax/discount handling:
   * - replace mode (or an empty draft): the invoice adopts the estimate's
   *   tax/discount, since the estimate becomes the whole bill.
   * - append onto a draft that already has lines: the invoice header terms are
   *   LEFT ALONE, so appending an estimate never silently re-taxes or
   *   re-discounts already-captured register/manual work.
   *
   * `mode` may be undefined. The block-with-choice gate is enforced HERE, inside
   * the transaction: if the draft already has lines and no mode was given, we
   * reject so the caller must explicitly pick append or replace. Counting in the
   * service is only a friendly pre-check; a line added between that read and this
   * transaction can't slip through as a silent append.
   *
   * Estimate lines are tagged source_kind='estimate' with their source ids and
   * start 'detached' (a converted line is a billing snapshot, not a live mirror).
   */
  async convertEstimateIntoDraft(
    jobId: string,
    input: EstimateConversionInput,
    mode?: EstimateConversionMode
  ): Promise<EstimateConversionResult> {
    const now = new Date().toISOString();
    return this.databaseService.transaction(async (queryable) => {
      // Lock the invoice row up front so a concurrent post cannot land between this read
      // and the line writes below. The status re-check is the authoritative guard (covers
      // append/replace/empty uniformly); the service does a friendlier pre-check.
      const invoice = await this.lockMainInvoiceByJob(jobId, queryable);
      if (invoice.status !== 'draft') {
        throw new ConflictException(
          'This invoice is posted and locked; estimates cannot be converted into it.'
        );
      }
      const invoiceId = invoice.id;

      // Claim the estimate atomically: only an approved, not-yet-converted
      // estimate passes. A race or repeat conversion changes zero rows here and
      // is rejected, so the invoice lines below can never be written twice.
      const claim = await queryable.query(
        `update estimates set
           converted_to_invoice_id = $2,
           converted_at = $3,
           converted_by_employee_id = $4,
           converted_by_name = $5,
           updated_at = $3
         where id = $1 and status = 'approved' and converted_to_invoice_id is null`,
        [input.estimateId, invoiceId, now, input.actor.id, input.actor.displayName]
      );
      if (claim.rowCount === 0) {
        throw new ConflictException(
          'This estimate is no longer convertible (not approved, or already converted).'
        );
      }

      const existingLines = await queryable.query<{ count: string | number }>(
        `select count(*) as count from invoice_line_items
         where invoice_id = $1 and is_void = false`,
        [invoiceId]
      );
      const hadLines = Number(existingLines.rows[0]?.count ?? 0) > 0;

      // Authoritative block-with-choice gate: a draft that already has lines
      // requires an explicit append/replace decision. Enforced inside the
      // transaction so a line added after the service's pre-check can't convert
      // as a silent append.
      if (hadLines && !mode) {
        throw new ConflictException(
          'The invoice draft already has lines. Choose "append" or "replace" to convert this estimate.'
        );
      }

      if (mode === 'replace') {
        await queryable.query(
          `update invoice_line_items
           set is_void = true, void_reason = 'Replaced by estimate conversion.', updated_at = $2
           where invoice_id = $1 and is_void = false`,
          [invoiceId, now]
        );
      }

      // Adopt the estimate's tax/discount only when the estimate becomes the
      // whole bill (empty draft or replace). Appending onto existing lines keeps
      // the invoice's current header terms untouched.
      if (mode === 'replace' || !hadLines) {
        const discount = normalizeDiscountColumns(input.discount);
        await queryable.query(
          `update invoices set
             tax_rate_basis_points = $2,
             discount_kind = $3,
             discount_basis_points = $4,
             discount_amount = $5,
             updated_at = $6
           where id = $1`,
          [
            invoiceId,
            input.taxRateBasisPoints,
            discount.kind,
            discount.basisPoints,
            discount.amount,
            now
          ]
        );
      }

      const positionResult = await queryable.query<{ nextPosition: number }>(
        `select coalesce(max(line_position) + 1, 0) as "nextPosition"
         from invoice_line_items where invoice_id = $1 and is_void = false`,
        [invoiceId]
      );
      let position = Number(positionResult.rows[0]?.nextPosition ?? 0);

      for (const line of input.lines) {
        await queryable.query(
          `insert into invoice_line_items (
             id, invoice_id, line_position, kind, description, quantity, unit_of_measure,
             unit_price, unit_cost, taxable, part_number, inventory_source_label,
             line_subtotal_amount, line_cost_amount,
             source_kind, source_estimate_id, source_estimate_line_item_id, source_sync_state,
             is_void, created_at, updated_at
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   'estimate', $15, $16, 'detached', false, $17, $17)`,
          [
            randomUUID(),
            invoiceId,
            position,
            line.kind,
            line.description,
            line.quantity,
            line.unitOfMeasure ?? null,
            line.unitPrice,
            line.unitCost ?? null,
            line.taxable,
            line.partNumber ?? null,
            line.inventorySourceLabel ?? null,
            // Copy the estimate's frozen per-line subtotal verbatim rather than
            // re-deriving it, so the converted invoice line matches the approved
            // estimate snapshot exactly (accounting trust).
            line.lineSubtotal,
            line.lineCost ?? null,
            input.estimateId,
            line.estimateLineItemId,
            now
          ]
        );
        position += 1;
      }

      await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, now]);
      await insertJobTimelineEntry(
        {
          id: randomUUID(),
          jobId,
          occurredAt: now,
          actorName: input.actor.displayName,
          kind: 'estimateConverted',
          message: `Estimate converted to invoice draft: ${input.estimateTitle}.`
        },
        queryable
      );

      await recalculateInvoiceTotals(invoiceId, now, queryable);

      return { invoiceId };
    });
  }
}

/** Map an optional discount union to its three nullable columns. */
function normalizeDiscountColumns(discount: InvoiceDiscountValue | undefined): {
  kind: 'percent' | 'fixed' | null;
  basisPoints: number | null;
  amount: number | null;
} {
  if (!discount) {
    return { kind: null, basisPoints: null, amount: null };
  }
  if (discount.kind === 'percent') {
    return { kind: 'percent', basisPoints: discount.basisPoints, amount: null };
  }
  return { kind: 'fixed', basisPoints: null, amount: discount.amount };
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

/**
 * Build the frozen posting context from its columns, or undefined for a draft. The
 * essential fields (ids, names, job number) are guaranteed non-null when posted by the
 * `invoices_posted_snapshot` CHECK; the `?? ''` are only type-safety fallbacks. Address
 * and account-type fields are optional and pass through as undefined when blank.
 */
function toPostedContext(row: InvoiceRow): PostedInvoiceContext | undefined {
  if (!row.postedAt || !row.postedByName) {
    return undefined;
  }
  return {
    postedAt: toIsoString(row.postedAt),
    postedByName: row.postedByName,
    billTo: {
      customerId: row.billToCustomerId ?? '',
      name: row.billToCustomerName ?? '',
      accountType: row.billToAccountType ?? undefined,
      addressLine1: row.billToAddressLine1 ?? undefined,
      city: row.billToCity ?? undefined,
      state: row.billToState ?? undefined,
      postalCode: row.billToPostalCode ?? undefined
    },
    serviceLocation: {
      locationId: row.serviceLocationId ?? '',
      name: row.serviceLocationName ?? '',
      addressLine1: row.serviceLocationAddressLine1 ?? undefined,
      city: row.serviceLocationCity ?? undefined,
      state: row.serviceLocationState ?? undefined,
      postalCode: row.serviceLocationPostalCode ?? undefined
    },
    jobNumber: row.jobNumber ?? '',
    workOrderNumber: row.workOrderNumber ?? undefined
  };
}
