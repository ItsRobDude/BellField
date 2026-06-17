import { randomUUID } from 'node:crypto';
import type { QueryExecutor } from '../../database/database.service';
import { centsToDollars } from './payments-repository-utils';

type RefundAllocationRow = {
  invoiceId: string;
  allocatedCents: string | number;
  refundedCents: string | number;
};

export async function insertRefundReversalAllocations(
  queryable: QueryExecutor,
  input: {
    refundId: string;
    paymentId: string;
    sourceInvoiceId: string | null;
    refundCents: number;
    now: string;
  }
): Promise<void> {
  const result = await queryable.query<RefundAllocationRow>(
    `select
       pa.invoice_id as "invoiceId",
       round(pa.amount * 100) as "allocatedCents",
       coalesce((
         select round(sum(ra.amount) * 100)
         from payment_refund_allocations ra
         join payment_refunds r on r.id = ra.refund_id
         where r.payment_id = pa.payment_id and ra.invoice_id = pa.invoice_id
       ), 0) as "refundedCents"
     from payment_allocations pa
     join invoices i on i.id = pa.invoice_id
     where pa.payment_id = $1
     order by
       case when $2::text is not null and pa.invoice_id = $2 then 0 else 1 end,
       case when i.invoice_kind = 'main' then 0 else 1 end,
       i.posted_at asc nulls last,
       i.id asc`,
    [input.paymentId, input.sourceInvoiceId]
  );

  let remainingCents = input.refundCents;
  for (const row of result.rows) {
    if (remainingCents <= 0) {
      break;
    }
    const reversibleCents = Number(row.allocatedCents) - Number(row.refundedCents);
    if (reversibleCents <= 0) {
      continue;
    }
    const reverseCents = Math.min(reversibleCents, remainingCents);
    await queryable.query(
      `insert into payment_refund_allocations (id, refund_id, invoice_id, amount, created_at)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), input.refundId, row.invoiceId, centsToDollars(reverseCents), input.now]
    );
    remainingCents -= reverseCents;
  }
}
