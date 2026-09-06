import type { BookkeepingBalanceItem, JobStatus } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import type { OpenBalanceCursor } from './bookkeeping.types';

type OpenBalanceDbRow = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  netBilled: string | number;
  paidTotal: string | number;
  amountDue: string | number;
};

/** Net billed for a job across posted invoices: main + adjustment add, credit subtracts, drafts and
 * voids contribute nothing. The single SQL fragment so AR, the worklist, and profitability revenue
 * can never disagree. Used inside a `group by i.job_id` aggregation. */
const POSTED_NET_BILLED_SUM = `sum(
  case
    when i.status = 'posted' and i.invoice_kind in ('main', 'adjustment') then i.total_amount
    when i.status = 'posted' and i.invoice_kind = 'credit' then -i.total_amount
    else 0
  end
)`;

function roundMoney(value: string | number): number {
  return Math.round(Number(value) * 100) / 100;
}

/** Net billed per job for every job with at least one posted invoice (a posted $0 warranty invoice
 * still qualifies — revenue 0). The revenue population for the job-profitability report. */
export type PostedRevenueRow = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  status: JobStatus;
  netBilled: number;
};

export async function queryPostedRevenueByJob(
  queryable: QueryExecutor
): Promise<PostedRevenueRow[]> {
  const result = await queryable.query<{
    jobId: string;
    jobNumber: string;
    customerName: string;
    status: JobStatus;
    netBilled: string | number;
  }>(
    `select
       j.id as "jobId",
       j.job_number as "jobNumber",
       c.name as "customerName",
       j.status as "status",
       coalesce(${POSTED_NET_BILLED_SUM}, 0) as "netBilled"
     from invoices i
     join jobs j on j.id = i.job_id
     join customers c on c.id = j.bill_to_customer_id
     group by j.id, j.job_number, c.name, j.status
     having count(*) filter (where i.status = 'posted') > 0
     order by "netBilled" desc`
  );
  return result.rows.map((row) => ({
    jobId: row.jobId,
    jobNumber: row.jobNumber,
    customerName: row.customerName,
    status: row.status,
    netBilled: roundMoney(row.netBilled)
  }));
}

/** Per-job balance population: net billed across posted invoices (main + adjustment − credit),
 * non-void payments, refunds, and the resulting amount due. Shared by the worklist page, its
 * count, and the AR report so they can never disagree. */
const OPEN_BALANCE_ROWS_CTE = `with billed as (
       select
         i.job_id,
         ${POSTED_NET_BILLED_SUM} as net_billed
       from invoices i
       group by i.job_id
     ),
     paid as (
       select p.job_id, coalesce(sum(p.amount), 0) as paid_total
       from payments p
       where p.is_void = false
       group by p.job_id
     ),
     refunded as (
       select r.job_id, coalesce(sum(r.amount), 0) as refunded_total
       from payment_refunds r
       group by r.job_id
     ),
     balances as (
       select
         j.id as job_id,
         j.job_number,
         c.name as customer_name,
         coalesce(b.net_billed, 0) as net_billed,
         coalesce(pd.paid_total, 0) as paid_total,
         coalesce(b.net_billed, 0) - coalesce(pd.paid_total, 0) + coalesce(rd.refunded_total, 0) as amount_due
       from billed b
       join jobs j on j.id = b.job_id
       join customers c on c.id = j.bill_to_customer_id
       left join paid pd on pd.job_id = b.job_id
       left join refunded rd on rd.job_id = b.job_id
     )`;

/**
 * Single source of truth for job open balances: net billed across posted invoices
 * (main + adjustment − credit) minus non-void payments, where that remains positive, highest
 * balance first (job id breaks ties so pages are stable). Pass a numeric `limit` for one
 * bookkeeping worklist page, optionally after a keyset `cursor`; pass `null` for the full
 * AR/open-balance report. Runs against any QueryExecutor (the pool or a transaction) so the
 * worklist and the report share one calculation and can never drift.
 */
export async function queryOpenBalanceRows(
  queryable: QueryExecutor,
  limit: number | null,
  cursor?: OpenBalanceCursor
): Promise<BookkeepingBalanceItem[]> {
  const values: unknown[] = [];
  const conditions = ['amount_due > 0'];

  if (cursor) {
    // Keyset paging on the sort key (amount_due desc, job_id desc): only rows that sort
    // strictly after the last row of the page already delivered.
    values.push(cursor.amountDue.toFixed(2), cursor.jobId);
    conditions.push(
      `(amount_due, job_id) < ($${values.length - 1}::numeric, $${values.length}::text)`
    );
  }

  let limitClause = '';
  if (limit !== null) {
    values.push(limit);
    limitClause = `\n     limit $${values.length}`;
  }

  const result = await queryable.query<OpenBalanceDbRow>(
    `${OPEN_BALANCE_ROWS_CTE}
     select
       job_id as "jobId",
       job_number as "jobNumber",
       customer_name as "customerName",
       net_billed as "netBilled",
       paid_total as "paidTotal",
       amount_due as "amountDue"
     from balances
     where ${conditions.join(' and ')}
     order by amount_due desc, job_id desc${limitClause}`,
    values
  );
  return result.rows.map((row) => ({
    jobId: row.jobId,
    jobNumber: row.jobNumber,
    customerName: row.customerName,
    netBilled: roundMoney(row.netBilled),
    paidTotal: roundMoney(row.paidTotal),
    amountDue: roundMoney(row.amountDue)
  }));
}

/** How many jobs currently carry an open balance — the worklist's true size, however it is paged. */
export async function countOpenBalanceRows(queryable: QueryExecutor): Promise<number> {
  const result = await queryable.query<{ count: string | number }>(
    `${OPEN_BALANCE_ROWS_CTE}
     select count(*) as "count"
     from balances
     where amount_due > 0`
  );
  return Number(result.rows[0]?.count ?? 0);
}
