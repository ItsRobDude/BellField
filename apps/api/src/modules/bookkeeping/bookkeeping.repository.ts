import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type { InvoiceKind } from '@bellfield/contracts';
import type {
  BookkeepingBalanceItemDto,
  BookkeepingInvoiceItemDto,
  BookkeepingPaymentBatchItemDto,
  OpenBalanceCursor,
  PaymentBatchCursor,
  ReadyToPostCursor,
  RecentlyPostedCursor
} from './bookkeeping.types';
import { countOpenBalanceRows, queryOpenBalanceRows } from './open-balance-query';

type InvoiceItemRow = {
  invoiceId: string;
  jobId: string;
  jobNumber: string;
  invoiceKind: InvoiceKind;
  customerName: string;
  total: string | number;
  postedAt: string | Date | null;
  updatedAt: string | Date;
};

type PaymentBatchRow = {
  batchDate: string | Date;
  method: BookkeepingPaymentBatchItemDto['method'];
  paymentCount: string | number;
  totalAmount: string | number;
  latestReceivedAt: string | Date;
};

type CountRow = {
  count: string | number;
};

// Every worklist pages by keyset: the caller asks for `limit` rows after an optional cursor
// (the sort key of the last row it already holds), and each query orders by that same key
// with the row id as the tiebreaker, so a page boundary can never skip or repeat a row. The
// matching count queries report each worklist's true size.
@Injectable()
export class BookkeepingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Draft invoices that have at least one active line — candidates to post. Includes
   * main drafts and draft adjustment/credit corrections, so bookkeeping catches every
   * postable record cross-job (the row's invoiceKind says which). Oldest edit first.
   */
  async listReadyToPost(input: {
    limit: number;
    cursor?: ReadyToPostCursor;
  }): Promise<BookkeepingInvoiceItemDto[]> {
    const result = await this.databaseService.query<InvoiceItemRow>(
      `select
         i.id as "invoiceId",
         i.job_id as "jobId",
         j.job_number as "jobNumber",
         i.invoice_kind as "invoiceKind",
         c.name as "customerName",
         i.total_amount as "total",
         null as "postedAt",
         i.updated_at as "updatedAt"
       from invoices i
       join jobs j on j.id = i.job_id
       join customers c on c.id = j.bill_to_customer_id
       where i.status = 'draft'
         and exists (
           select 1 from invoice_line_items li
           where li.invoice_id = i.id and li.is_void = false
         )
         and ($2::timestamptz is null or (i.updated_at, i.id) > ($2::timestamptz, $3::text))
       order by i.updated_at asc, i.id asc
       limit $1`,
      [input.limit, input.cursor?.updatedAt ?? null, input.cursor?.id ?? null]
    );
    return result.rows.map(toInvoiceItem);
  }

  async countReadyToPost(): Promise<number> {
    const result = await this.databaseService.query<CountRow>(
      `select count(*) as "count"
       from invoices i
       where i.status = 'draft'
         and exists (
           select 1 from invoice_line_items li
           where li.invoice_id = i.id and li.is_void = false
         )`
    );
    return toCount(result.rows[0]);
  }

  /** Recently posted invoices (any kind), newest first. */
  async listRecentlyPosted(input: {
    limit: number;
    cursor?: RecentlyPostedCursor;
  }): Promise<BookkeepingInvoiceItemDto[]> {
    const result = await this.databaseService.query<InvoiceItemRow>(
      `select
         i.id as "invoiceId",
         i.job_id as "jobId",
         j.job_number as "jobNumber",
         i.invoice_kind as "invoiceKind",
         c.name as "customerName",
         i.total_amount as "total",
         i.posted_at as "postedAt",
         i.updated_at as "updatedAt"
       from invoices i
       join jobs j on j.id = i.job_id
       join customers c on c.id = j.bill_to_customer_id
       where i.status = 'posted'
         and ($2::timestamptz is null or (i.posted_at, i.id) < ($2::timestamptz, $3::text))
       order by i.posted_at desc, i.id desc
       limit $1`,
      [input.limit, input.cursor?.postedAt ?? null, input.cursor?.id ?? null]
    );
    return result.rows.map(toInvoiceItem);
  }

  async countRecentlyPosted(): Promise<number> {
    const result = await this.databaseService.query<CountRow>(
      `select count(*) as "count"
       from invoices i
       where i.status = 'posted'`
    );
    return toCount(result.rows[0]);
  }

  /**
   * Jobs with an outstanding balance: net billed across posted invoices (main +
   * adjustments − credits) minus non-void payments, where that is still positive.
   * Highest balance first.
   */
  async listOpenBalances(input: {
    limit: number;
    cursor?: OpenBalanceCursor;
  }): Promise<BookkeepingBalanceItemDto[]> {
    // The open-balance math lives in a shared helper so the AR/open-balance report reuses the exact
    // same calculation (single source of truth — see open-balance-query.ts).
    return queryOpenBalanceRows(this.databaseService, input.limit, input.cursor);
  }

  async countOpenBalances(): Promise<number> {
    return countOpenBalanceRows(this.databaseService);
  }

  /** Recent non-void payment groupings for deposit prep. Read-only: no deposit state exists yet. */
  async listPaymentBatches(input: {
    limit: number;
    cursor?: PaymentBatchCursor;
  }): Promise<BookkeepingPaymentBatchItemDto[]> {
    const result = await this.databaseService.query<PaymentBatchRow>(
      `select
         b.batch_date as "batchDate",
         b.method,
         b.payment_count as "paymentCount",
         b.total_amount as "totalAmount",
         b.latest_received_at as "latestReceivedAt"
       from (
         select
           p.received_at::date as batch_date,
           p.method,
           count(*) as payment_count,
           coalesce(sum(p.amount), 0) as total_amount,
           max(p.received_at) as latest_received_at
         from payments p
         where p.is_void = false
         group by p.received_at::date, p.method
       ) b
       where (
         $2::date is null
         or b.batch_date < $2::date
         or (b.batch_date = $2::date and b.method > $3::text)
       )
       order by b.batch_date desc, b.method asc
       limit $1`,
      [input.limit, input.cursor?.batchDate ?? null, input.cursor?.method ?? null]
    );
    return result.rows.map((row) => ({
      batchDate:
        row.batchDate instanceof Date
          ? row.batchDate.toISOString().slice(0, 10)
          : String(row.batchDate).slice(0, 10),
      method: row.method,
      paymentCount: Number(row.paymentCount),
      totalAmount: roundMoney(row.totalAmount),
      latestReceivedAt: toIsoString(row.latestReceivedAt)
    }));
  }

  async countPaymentBatches(): Promise<number> {
    const result = await this.databaseService.query<CountRow>(
      `select count(*) as "count"
       from (
         select 1
         from payments p
         where p.is_void = false
         group by p.received_at::date, p.method
       ) b`
    );
    return toCount(result.rows[0]);
  }
}

function toInvoiceItem(row: InvoiceItemRow): BookkeepingInvoiceItemDto {
  return {
    invoiceId: row.invoiceId,
    jobId: row.jobId,
    jobNumber: row.jobNumber,
    invoiceKind: row.invoiceKind,
    customerName: row.customerName,
    total: roundMoney(row.total),
    postedAt: row.postedAt ? toIsoString(row.postedAt) : undefined,
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toCount(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function roundMoney(value: string | number): number {
  return Math.round(Number(value) * 100) / 100;
}
