import { randomUUID } from 'node:crypto';
import type { QueryExecutor } from '../../database/database.service';
import type { JobTimelineEntry } from './company-data.types';

export type TimelineInsertRow = {
  id: string;
  jobId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: JobTimelineEntry['kind'];
  message: string;
};

export async function insertJobTimelineEntry(
  entry: TimelineInsertRow,
  queryable: QueryExecutor
): Promise<void> {
  await queryable.query(
    `
      insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [entry.id, entry.jobId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
  );
}

export function buildRegisterEntryVoidedMessage(
  description: string,
  reason: string | null
): string {
  if (!reason) {
    return `Register entry voided: ${description}.`;
  }

  return `Register entry voided: ${description}. Reason: ${reason}${reason.endsWith('.') ? '' : '.'}`;
}

export function buildMediaCaptionMessage(filename: string, caption: string | null): string {
  if (!caption) {
    return `Caption cleared on ${filename}.`;
  }
  return `Caption updated on ${filename}: ${caption}`;
}

export function buildMediaVoidedMessage(filename: string, reason: string | null): string {
  if (reason) {
    return `${filename} voided (reason: ${reason}).`;
  }
  return `${filename} voided.`;
}

/**
 * Create the single main invoice draft for a job if it does not already have one.
 *
 * Every job owns exactly one main invoice (the running bill it builds into), and
 * the database enforces that with a partial unique index. This helper is the one
 * place that initial empty draft is created, called from all three entry points —
 * job creation, seed bootstrap, and the backfill — so the invariant holds no
 * matter how a job came to exist. It is idempotent (`on conflict do nothing`),
 * so calling it for a job that already has a draft is a safe no-op.
 *
 * Must run inside the same transaction/queryable as the job insert so a job is
 * never briefly missing its draft.
 *
 * The draft seeds its sales-tax rate from company settings at creation (0 when
 * the company does not charge sales tax, or before settings exist). Read in the
 * same statement so the seed is transaction-consistent; without this, drafts
 * inherit the column default of 0 bps and register-first/manual invoices bill
 * $0 tax (the 2026-07-14 gap-analysis bug).
 */
export async function ensureMainInvoiceDraft(
  jobId: string,
  occurredAt: string,
  queryable: QueryExecutor
): Promise<void> {
  await queryable.query(
    `
      insert into invoices (id, job_id, invoice_kind, status, tax_rate_basis_points, created_at, updated_at, version)
      values (
        $1, $2, 'main', 'draft',
        coalesce(
          (
            select case when charges_sales_tax then default_sales_tax_basis_points else 0 end
            from company_settings
            limit 1
          ),
          0
        ),
        $3, $3, 1
      )
      on conflict (job_id) where invoice_kind = 'main' do nothing
    `,
    [randomUUID(), jobId, occurredAt]
  );
}
