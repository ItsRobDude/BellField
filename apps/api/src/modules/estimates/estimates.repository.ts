import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toOptionalDateString } from '../../database/database-row.utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';
import type {
  EstimateDiscountValue,
  EstimateLineItemRecord,
  EstimateOptionGroupRecord,
  EstimateRecord,
  EstimateStatusValue,
  EstimateTotalsRecord,
  EstimateWriteInput
} from './estimates.types';

type EstimateRow = {
  id: string;
  jobId: string;
  status: EstimateStatusValue;
  title: string;
  description: string | null;
  taxRateBasisPoints: number;
  discountKind: 'percent' | 'fixed' | null;
  discountBasisPoints: number | null;
  discountAmount: string | number | null;
  validUntil: string | Date | null;
  subtotalAmount: string | number;
  discountAmountApplied: string | number;
  taxableBaseAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  totalCostAmount: string | number;
  profitAmount: string | number;
  marginBasisPoints: number | null;
  costComplete: boolean;
  approvedAt: string | Date | null;
  approvedByEmployeeId: string | null;
  approvedByName: string | null;
  declinedAt: string | Date | null;
  declinedByEmployeeId: string | null;
  declinedByName: string | null;
  sourceEstimateId: string | null;
  supersededByEstimateId: string | null;
  convertedToInvoiceId: string | null;
  optionGroups: EstimateOptionGroupRecord[] | null;
  selectedOptionId: string | null;
  createdByEmployeeId: string;
  createdByName: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  version: number;
};

type EstimateLineItemRow = {
  id: string;
  estimateId: string;
  position: number;
  kind: EstimateLineItemRecord['kind'];
  description: string;
  quantity: string | number;
  unitOfMeasure: string | null;
  unitPrice: string | number;
  unitCost: string | number | null;
  taxable: boolean;
  partNumber: string | null;
  inventorySourceLabel: string | null;
  catalogItemId: string | null;
  catalogSnapshot: EstimateLineItemRecord['catalogSnapshot'] | null;
  optionGroupId: string | null;
  optionId: string | null;
  lineSubtotal: string | number;
  lineCost: string | number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const ESTIMATE_COLUMNS = `
  id,
  job_id as "jobId",
  status,
  title,
  description,
  tax_rate_basis_points as "taxRateBasisPoints",
  discount_kind as "discountKind",
  discount_basis_points as "discountBasisPoints",
  discount_amount as "discountAmount",
  valid_until as "validUntil",
  subtotal_amount as "subtotalAmount",
  discount_amount_applied as "discountAmountApplied",
  taxable_base_amount as "taxableBaseAmount",
  tax_amount as "taxAmount",
  total_amount as "totalAmount",
  total_cost_amount as "totalCostAmount",
  profit_amount as "profitAmount",
  margin_basis_points as "marginBasisPoints",
  cost_complete as "costComplete",
  approved_at as "approvedAt",
  approved_by_employee_id as "approvedByEmployeeId",
  approved_by_name as "approvedByName",
  declined_at as "declinedAt",
  declined_by_employee_id as "declinedByEmployeeId",
  declined_by_name as "declinedByName",
  source_estimate_id as "sourceEstimateId",
  superseded_by_estimate_id as "supersededByEstimateId",
  converted_to_invoice_id as "convertedToInvoiceId",
  option_groups as "optionGroups",
  selected_option_id as "selectedOptionId",
  created_by_employee_id as "createdByEmployeeId",
  created_by_name as "createdByName",
  created_at as "createdAt",
  updated_at as "updatedAt",
  version
`;

const ESTIMATE_LINE_COLUMNS = `
  id,
  estimate_id as "estimateId",
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
  catalog_item_id as "catalogItemId",
  catalog_snapshot as "catalogSnapshot",
  option_group_id as "optionGroupId",
  option_id as "optionId",
  line_subtotal_amount as "lineSubtotal",
  line_cost_amount as "lineCost",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

@Injectable()
export class EstimatesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listEstimatesForJob(jobId: string): Promise<EstimateRecord[]> {
    const estimateResult = await this.databaseService.query<EstimateRow>(
      `select ${ESTIMATE_COLUMNS} from estimates where job_id = $1 order by created_at desc, id desc`,
      [jobId]
    );

    if (estimateResult.rows.length === 0) {
      return [];
    }

    const estimateIds = estimateResult.rows.map((row) => row.id);
    const lineResult = await this.databaseService.query<EstimateLineItemRow>(
      `select ${ESTIMATE_LINE_COLUMNS} from estimate_line_items where estimate_id = any($1::text[]) order by line_position asc`,
      [estimateIds]
    );

    const linesByEstimate = new Map<string, EstimateLineItemRecord[]>();
    for (const lineRow of lineResult.rows) {
      const list = linesByEstimate.get(lineRow.estimateId) ?? [];
      list.push(this.toLineItemRecord(lineRow));
      linesByEstimate.set(lineRow.estimateId, list);
    }

    return estimateResult.rows.map((row) =>
      this.toEstimateRecord(row, linesByEstimate.get(row.id) ?? [])
    );
  }

  async getEstimateById(estimateId: string): Promise<EstimateRecord | null> {
    const estimateResult = await this.databaseService.query<EstimateRow>(
      `select ${ESTIMATE_COLUMNS} from estimates where id = $1 limit 1`,
      [estimateId]
    );

    const row = estimateResult.rows[0];
    if (!row) {
      return null;
    }

    const lineResult = await this.databaseService.query<EstimateLineItemRow>(
      `select ${ESTIMATE_LINE_COLUMNS} from estimate_line_items where estimate_id = $1 order by line_position asc`,
      [estimateId]
    );

    return this.toEstimateRecord(
      row,
      lineResult.rows.map((lineRow) => this.toLineItemRecord(lineRow))
    );
  }

  async catalogItemExists(catalogItemId: string): Promise<boolean> {
    const result = await this.databaseService.query<{ id: string }>(
      `select id from catalog_items where id = $1 limit 1`,
      [catalogItemId]
    );
    return Boolean(result.rows[0]);
  }

  async createEstimate(
    jobId: string,
    input: EstimateWriteInput,
    actor: { id: string; displayName: string }
  ): Promise<EstimateRecord> {
    const now = new Date().toISOString();
    const estimateId = randomUUID();
    const discount = normalizeDiscountColumns(input.discount);

    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `
          insert into estimates (
            id, job_id, status, title, description,
            tax_rate_basis_points, discount_kind, discount_basis_points, discount_amount, valid_until,
            subtotal_amount, discount_amount_applied, taxable_base_amount, tax_amount, total_amount,
            total_cost_amount, profit_amount, margin_basis_points, cost_complete,
            option_groups, selected_option_id,
            created_by_employee_id, created_by_name, created_at, updated_at, version
          )
          values (
            $1, $2, 'pending', $3, $4,
            $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20,
            $21, $22, $23, $23, 1
          )
        `,
        [
          estimateId,
          jobId,
          input.title,
          input.description ?? null,
          input.taxRateBasisPoints,
          discount.kind,
          discount.basisPoints,
          discount.amount,
          input.validUntil ?? null,
          input.totals.subtotal,
          input.totals.discount,
          input.totals.taxableBase,
          input.totals.tax,
          input.totals.total,
          input.totals.totalCost,
          input.totals.profit,
          input.totals.marginBasisPoints,
          input.totals.costComplete,
          input.optionGroups ? JSON.stringify(input.optionGroups) : null,
          input.selectedOptionId ?? null,
          actor.id,
          actor.displayName,
          now
        ]
      );

      await this.insertLineItems(queryable, estimateId, input, now);
      await this.touchJobWithTimeline(queryable, jobId, now, {
        actorName: actor.displayName,
        kind: 'estimateCreated',
        message: `Estimate created: ${input.title}.`
      });
    });

    const created = await this.getEstimateById(estimateId);
    if (!created) {
      throw new Error('Created estimate could not be loaded.');
    }
    return created;
  }

  /** Whole-estimate replacement. Caller guarantees the estimate is pending. */
  async replaceEstimate(
    estimateId: string,
    input: EstimateWriteInput,
    actor: { id: string; displayName: string }
  ): Promise<EstimateRecord | null> {
    const existing = await this.getEstimateById(estimateId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const discount = normalizeDiscountColumns(input.discount);

    await this.databaseService.transaction(async (queryable) => {
      // Guard the status transition in the WHERE clause, not just in the service's
      // earlier read: two concurrent requests could both pass the read-time check,
      // so the database is the only place that can enforce "still pending" atomically.
      const updateResult = await queryable.query(
        `
          update estimates
          set
            title = $2,
            description = $3,
            tax_rate_basis_points = $4,
            discount_kind = $5,
            discount_basis_points = $6,
            discount_amount = $7,
            valid_until = $8,
            subtotal_amount = $9,
            discount_amount_applied = $10,
            taxable_base_amount = $11,
            tax_amount = $12,
            total_amount = $13,
            total_cost_amount = $14,
            profit_amount = $15,
            margin_basis_points = $16,
            cost_complete = $17,
            option_groups = $18,
            selected_option_id = $19,
            updated_at = $20,
            version = version + 1
          where id = $1 and status = 'pending'
        `,
        [
          estimateId,
          input.title,
          input.description ?? null,
          input.taxRateBasisPoints,
          discount.kind,
          discount.basisPoints,
          discount.amount,
          input.validUntil ?? null,
          input.totals.subtotal,
          input.totals.discount,
          input.totals.taxableBase,
          input.totals.tax,
          input.totals.total,
          input.totals.totalCost,
          input.totals.profit,
          input.totals.marginBasisPoints,
          input.totals.costComplete,
          input.optionGroups ? JSON.stringify(input.optionGroups) : null,
          input.selectedOptionId ?? null,
          now
        ]
      );

      if (updateResult.rowCount === 0) {
        throw new ConflictException(
          'This estimate is no longer pending and can no longer be edited.'
        );
      }

      // Lines are positional and fully replaced on every write, so the simplest
      // correct approach is delete-then-insert inside the same transaction.
      await queryable.query('delete from estimate_line_items where estimate_id = $1', [estimateId]);
      await this.insertLineItems(queryable, estimateId, input, now);
      await this.touchJobWithTimeline(queryable, existing.jobId, now, {
        actorName: actor.displayName,
        kind: 'estimateUpdated',
        message: `Estimate updated: ${input.title}.`
      });
    });

    return this.getEstimateById(estimateId);
  }

  async approveEstimate(
    estimateId: string,
    actor: { id: string; displayName: string },
    approvedOption: { selectedOptionId?: string; totals?: EstimateTotalsRecord } = {}
  ): Promise<EstimateRecord | null> {
    const existing = await this.getEstimateById(estimateId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      // status guard in the WHERE clause makes the pending -> approved transition
      // atomic against a concurrent approve/decline/edit.
      const updateResult = await queryable.query(
        `
          update estimates
          set status = 'approved', approved_at = $2, approved_by_employee_id = $3,
              approved_by_name = $4,
              selected_option_id = coalesce($5, selected_option_id),
              subtotal_amount = case when $5 is null then subtotal_amount else $6 end,
              discount_amount_applied = case when $5 is null then discount_amount_applied else $7 end,
              taxable_base_amount = case when $5 is null then taxable_base_amount else $8 end,
              tax_amount = case when $5 is null then tax_amount else $9 end,
              total_amount = case when $5 is null then total_amount else $10 end,
              total_cost_amount = case when $5 is null then total_cost_amount else $11 end,
              profit_amount = case when $5 is null then profit_amount else $12 end,
              margin_basis_points = case when $5 is null then margin_basis_points else $13 end,
              cost_complete = case when $5 is null then cost_complete else $14 end,
              updated_at = $2, version = version + 1
          where id = $1 and status = 'pending'
        `,
        [
          estimateId,
          now,
          actor.id,
          actor.displayName,
          approvedOption.selectedOptionId ?? null,
          approvedOption.totals?.subtotal ?? null,
          approvedOption.totals?.discount ?? null,
          approvedOption.totals?.taxableBase ?? null,
          approvedOption.totals?.tax ?? null,
          approvedOption.totals?.total ?? null,
          approvedOption.totals?.totalCost ?? null,
          approvedOption.totals?.profit ?? null,
          approvedOption.totals?.marginBasisPoints ?? null,
          approvedOption.totals?.costComplete ?? null
        ]
      );

      if (updateResult.rowCount === 0) {
        throw new ConflictException('This estimate is no longer pending and cannot be approved.');
      }

      await this.touchJobWithTimeline(queryable, existing.jobId, now, {
        actorName: actor.displayName,
        kind: 'estimateApproved',
        message: `Estimate approved: ${existing.title}.`
      });
    });

    return this.getEstimateById(estimateId);
  }

  async declineEstimate(
    estimateId: string,
    reason: string | undefined,
    actor: { id: string; displayName: string }
  ): Promise<EstimateRecord | null> {
    const existing = await this.getEstimateById(estimateId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const trimmedReason = reason?.trim() || null;

    await this.databaseService.transaction(async (queryable) => {
      // status guard in the WHERE clause makes the pending -> declined transition
      // atomic against a concurrent approve/decline/edit.
      const updateResult = await queryable.query(
        `
          update estimates
          set status = 'declined', declined_at = $2, declined_by_employee_id = $3,
              declined_by_name = $4, updated_at = $2, version = version + 1
          where id = $1 and status = 'pending'
        `,
        [estimateId, now, actor.id, actor.displayName]
      );

      if (updateResult.rowCount === 0) {
        throw new ConflictException('This estimate is no longer pending and cannot be declined.');
      }

      await this.touchJobWithTimeline(queryable, existing.jobId, now, {
        actorName: actor.displayName,
        kind: 'estimateDeclined',
        message: trimmedReason
          ? `Estimate declined: ${existing.title}. Reason: ${trimmedReason}${trimmedReason.endsWith('.') ? '' : '.'}`
          : `Estimate declined: ${existing.title}.`
      });
    });

    return this.getEstimateById(estimateId);
  }

  private async insertLineItems(
    queryable: QueryExecutor,
    estimateId: string,
    input: EstimateWriteInput,
    now: string
  ): Promise<void> {
    for (let index = 0; index < input.lineItems.length; index += 1) {
      const line = input.lineItems[index];
      const lineTotals = input.lineTotals[index];
      await queryable.query(
        `
          insert into estimate_line_items (
            id, estimate_id, line_position, kind, description, quantity, unit_of_measure,
            unit_price, unit_cost, taxable, part_number, inventory_source_label,
            catalog_item_id, catalog_snapshot, option_group_id, option_id,
            line_subtotal_amount, line_cost_amount,
            created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $20
          )
        `,
        [
          randomUUID(),
          estimateId,
          index,
          line.kind,
          line.description.trim(),
          line.quantity,
          line.unitOfMeasure?.trim() || null,
          line.unitPrice,
          line.unitCost ?? null,
          line.taxable,
          line.partNumber?.trim() || null,
          line.inventorySourceLabel?.trim() || null,
          line.catalogItemId?.trim() || null,
          line.catalogSnapshot ? JSON.stringify(line.catalogSnapshot) : null,
          line.optionGroupId?.trim() || null,
          line.optionId?.trim() || null,
          lineTotals.lineSubtotal,
          lineTotals.lineCost ?? null,
          now
        ]
      );
    }
  }

  private async touchJobWithTimeline(
    queryable: QueryExecutor,
    jobId: string,
    occurredAt: string,
    timeline: {
      actorName: string;
      kind:
        | 'estimateCreated'
        | 'estimateUpdated'
        | 'estimateApproved'
        | 'estimateDeclined'
        | 'estimateConverted';
      message: string;
    }
  ): Promise<void> {
    await queryable.query('update jobs set updated_at = $2 where id = $1', [jobId, occurredAt]);
    await insertJobTimelineEntry(
      {
        id: randomUUID(),
        jobId,
        occurredAt,
        actorName: timeline.actorName,
        kind: timeline.kind,
        message: timeline.message
      },
      queryable
    );
  }

  private toEstimateRecord(row: EstimateRow, lineItems: EstimateLineItemRecord[]): EstimateRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      title: row.title,
      description: row.description ?? undefined,
      taxRateBasisPoints: row.taxRateBasisPoints,
      discount: toDiscount(row),
      validUntil: toOptionalDateString(row.validUntil),
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
      approvedAt: row.approvedAt ? toIsoString(row.approvedAt) : undefined,
      approvedByEmployeeId: row.approvedByEmployeeId ?? undefined,
      approvedByName: row.approvedByName ?? undefined,
      declinedAt: row.declinedAt ? toIsoString(row.declinedAt) : undefined,
      declinedByEmployeeId: row.declinedByEmployeeId ?? undefined,
      declinedByName: row.declinedByName ?? undefined,
      sourceEstimateId: row.sourceEstimateId ?? undefined,
      supersededByEstimateId: row.supersededByEstimateId ?? undefined,
      convertedToInvoiceId: row.convertedToInvoiceId ?? undefined,
      optionGroups: row.optionGroups ?? undefined,
      selectedOptionId: row.selectedOptionId ?? undefined,
      createdByEmployeeId: row.createdByEmployeeId,
      createdByName: row.createdByName,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
      version: row.version
    };
  }

  private toLineItemRecord(row: EstimateLineItemRow): EstimateLineItemRecord {
    return {
      id: row.id,
      estimateId: row.estimateId,
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
      catalogItemId: row.catalogItemId ?? undefined,
      catalogSnapshot: row.catalogSnapshot ?? undefined,
      optionGroupId: row.optionGroupId ?? undefined,
      optionId: row.optionId ?? undefined,
      lineSubtotal: Number(row.lineSubtotal),
      lineCost: row.lineCost === null ? undefined : Number(row.lineCost),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }
}

function normalizeDiscountColumns(discount: EstimateDiscountValue | undefined): {
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

function toDiscount(row: EstimateRow): EstimateDiscountValue | undefined {
  if (row.discountKind === 'percent' && row.discountBasisPoints !== null) {
    return { kind: 'percent', basisPoints: row.discountBasisPoints };
  }
  if (row.discountKind === 'fixed' && row.discountAmount !== null) {
    return { kind: 'fixed', amount: Number(row.discountAmount) };
  }
  return undefined;
}
