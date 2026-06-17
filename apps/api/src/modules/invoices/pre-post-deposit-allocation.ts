import { randomUUID } from 'node:crypto';
import type { QueryExecutor } from '../../database/database.service';
import { centsToDollars, dollarsToCents } from './payments-repository-utils';

type MainInvoiceCapacityRow = {
  total: string | number;
  netAllocated: string | number;
};

type DepositCreditRow = {
  paymentId: string;
  amount: string | number;
  refunded: string | number;
};

/**
 * Apply deposit credit that was collected before the main invoice existed as a
 * posted charge. The caller owns the surrounding transaction and job lock.
 */
export async function allocatePrePostDepositsToPostedMainInvoice(
  queryable: QueryExecutor,
  input: { jobId: string; invoiceId: string; now: string }
): Promise<number> {
  let remainingInvoiceCents = await getMainInvoiceRemainingCents(queryable, input);
  if (remainingInvoiceCents <= 0) {
    return 0;
  }

  const deposits = await listUnallocatedDepositCredits(queryable, input.jobId);
  let allocatedCents = 0;

  for (const deposit of deposits) {
    if (remainingInvoiceCents <= 0) {
      break;
    }

    const availableDepositCents = Math.max(
      dollarsToCents(deposit.amount) - dollarsToCents(deposit.refunded),
      0
    );
    const allocationCents = Math.min(availableDepositCents, remainingInvoiceCents);
    if (allocationCents <= 0) {
      continue;
    }

    await queryable.query(
      `insert into payment_allocations (id, payment_id, invoice_id, amount, created_at)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), deposit.paymentId, input.invoiceId, centsToDollars(allocationCents), input.now]
    );
    remainingInvoiceCents -= allocationCents;
    allocatedCents += allocationCents;
  }

  return allocatedCents;
}

async function getMainInvoiceRemainingCents(
  queryable: QueryExecutor,
  input: { jobId: string; invoiceId: string }
): Promise<number> {
  const result = await queryable.query<MainInvoiceCapacityRow>(
    `with active_allocations as (
       select coalesce(sum(pa.amount), 0) as allocated
       from payment_allocations pa
       join payments p on p.id = pa.payment_id
       where pa.invoice_id = $2
         and p.is_void = false
     ),
     refunded_allocations as (
       select coalesce(sum(ra.amount), 0) as refunded
       from payment_refund_allocations ra
       where ra.invoice_id = $2
     )
     select
       i.total_amount as total,
       coalesce(aa.allocated, 0) - coalesce(ra.refunded, 0) as "netAllocated"
     from invoices i
     cross join active_allocations aa
     cross join refunded_allocations ra
     where i.job_id = $1
       and i.id = $2
       and i.status = 'posted'
       and i.invoice_kind = 'main'
     limit 1`,
    [input.jobId, input.invoiceId]
  );
  const row = result.rows[0];
  if (!row) {
    return 0;
  }
  return Math.max(dollarsToCents(row.total) - dollarsToCents(row.netAllocated), 0);
}

async function listUnallocatedDepositCredits(
  queryable: QueryExecutor,
  jobId: string
): Promise<DepositCreditRow[]> {
  const result = await queryable.query<DepositCreditRow>(
    `with refunded as (
       select payment_id, coalesce(sum(amount), 0) as refunded
       from payment_refunds
       group by payment_id
     )
     select
       p.id as "paymentId",
       p.amount,
       coalesce(r.refunded, 0) as refunded
     from payments p
     left join refunded r on r.payment_id = p.id
     where p.job_id = $1
       and p.invoice_id is null
       and p.purpose = 'deposit'
       and p.is_void = false
       and not exists (
         select 1 from payment_allocations pa_existing
         where pa_existing.payment_id = p.id
       )
     order by p.received_at asc, p.created_at asc, p.id asc`,
    [jobId]
  );
  return result.rows;
}
