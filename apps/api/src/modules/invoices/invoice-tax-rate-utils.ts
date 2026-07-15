import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service';
import { recalculateInvoiceTotals } from '../company-data/invoice-reflection-utils';
import { insertJobTimelineEntry } from '../company-data/jobs-data-repository-utils';

/** Render basis points as a human percent: 825 -> "8.25", 800 -> "8". */
function formatTaxRatePercent(taxRateBasisPoints: number): string {
  return (taxRateBasisPoints / 100).toFixed(2).replace(/\.?0+$/, '');
}

const invoiceKindLabels: Record<string, string> = {
  main: 'invoice',
  adjustment: 'adjustment',
  credit: 'credit'
};

/**
 * Set the header sales-tax rate on a DRAFT invoice (main, adjustment, or credit)
 * and recompute its snapshot totals through the shared pricing path.
 *
 * The write is a guarded update (`status = 'draft'`) inside one transaction, so a
 * concurrent post either wins first (this update matches zero rows and rejects)
 * or blocks on the row lock until the rate change commits — a posted invoice's
 * frozen totals can never change here. Lives beside the repository (like
 * invoice-number-utils) rather than in it, to keep the repository under the
 * file-size guardrail.
 */
export async function setDraftInvoiceTaxRate(
  databaseService: DatabaseService,
  invoiceId: string,
  taxRateBasisPoints: number,
  actorName: string
): Promise<void> {
  const now = new Date().toISOString();
  await databaseService.transaction(async (queryable) => {
    const updated = await queryable.query<{ jobId: string; invoiceKind: string }>(
      `update invoices set
         tax_rate_basis_points = $2,
         updated_at = $3,
         version = version + 1
       where id = $1 and status = 'draft'
       returning job_id as "jobId", invoice_kind as "invoiceKind"`,
      [invoiceId, taxRateBasisPoints, now]
    );
    const row = updated.rows[0];
    if (!row) {
      const existing = await queryable.query<{ status: string }>(
        `select status from invoices where id = $1 limit 1`,
        [invoiceId]
      );
      if (!existing.rows[0]) {
        throw new NotFoundException('Invoice not found.');
      }
      throw new ConflictException(
        'This invoice is posted and locked; its tax rate can no longer change.'
      );
    }

    await recalculateInvoiceTotals(invoiceId, now, queryable);

    await queryable.query('update jobs set updated_at = $2 where id = $1', [row.jobId, now]);
    await insertJobTimelineEntry(
      {
        id: randomUUID(),
        jobId: row.jobId,
        occurredAt: now,
        actorName,
        kind: 'invoiceTaxRateChanged',
        message: `Sales tax rate set to ${formatTaxRatePercent(taxRateBasisPoints)}% on the ${
          invoiceKindLabels[row.invoiceKind] ?? 'invoice'
        } draft.`
      },
      queryable
    );
  });
}
