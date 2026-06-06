import type { BookkeepingBalanceItem, JobStatus } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';

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

/**
 * Single source of truth for job open balances: net billed across posted invoices
 * (main + adjustment − credit) minus non-void payments, where that remains positive, highest
 * balance first. Pass a numeric `limit` for the bookkeeping worklist top-N; pass `null` for the
 * full AR/open-balance report. Runs against any QueryExecutor (the pool or a transaction) so the
 * worklist and the report share one calculation and can never drift.
 */
export async function queryOpenBalanceRows(
  queryable: QueryExecutor,
  limit: number | null
): Promise<BookkeepingBalanceItem[]> {
  const result = await queryable.query<OpenBalanceDbRow>(
    `with billed as (
       select
         i.job_id,
         ${POSTED_NET_BILLED_SUM} as net_billed
       from invoices i
       group by i.job_id
     ),
     paid as (
       select inv.job_id, coalesce(sum(p.amount), 0) as paid_total
       from payments p
       join invoices inv on inv.id = p.invoice_id
       where p.is_void = false
       group by inv.job_id
     )
     select
       j.id as "jobId",
       j.job_number as "jobNumber",
       c.name as "customerName",
       coalesce(b.net_billed, 0) as "netBilled",
       coalesce(pd.paid_total, 0) as "paidTotal",
       coalesce(b.net_billed, 0) - coalesce(pd.paid_total, 0) as "amountDue"
     from billed b
     join jobs j on j.id = b.job_id
     join customers c on c.id = j.bill_to_customer_id
     left join paid pd on pd.job_id = b.job_id
     where coalesce(b.net_billed, 0) - coalesce(pd.paid_total, 0) > 0
     order by "amountDue" desc${limit !== null ? '\n     limit $1' : ''}`,
    limit !== null ? [limit] : []
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
