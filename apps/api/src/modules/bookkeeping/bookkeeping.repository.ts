import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type { InvoiceKind } from '@bellfield/contracts';
import type { BookkeepingBalanceItemDto, BookkeepingInvoiceItemDto } from './bookkeeping.types';

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

type BalanceItemRow = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  netBilled: string | number;
  paidTotal: string | number;
  amountDue: string | number;
};

@Injectable()
export class BookkeepingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Main invoice drafts that have at least one active line — candidates to post. */
  async listReadyToPost(limit: number): Promise<BookkeepingInvoiceItemDto[]> {
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
       where i.invoice_kind = 'main'
         and i.status = 'draft'
         and exists (
           select 1 from invoice_line_items li
           where li.invoice_id = i.id and li.is_void = false
         )
       order by i.updated_at asc
       limit $1`,
      [limit]
    );
    return result.rows.map(toInvoiceItem);
  }

  /** Recently posted invoices (any kind), newest first. */
  async listRecentlyPosted(limit: number): Promise<BookkeepingInvoiceItemDto[]> {
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
       order by i.posted_at desc
       limit $1`,
      [limit]
    );
    return result.rows.map(toInvoiceItem);
  }

  /**
   * Jobs with an outstanding balance: net billed across posted invoices (main +
   * adjustments − credits) minus non-void payments, where that is still positive.
   * Highest balance first.
   */
  async listOpenBalances(limit: number): Promise<BookkeepingBalanceItemDto[]> {
    const result = await this.databaseService.query<BalanceItemRow>(
      `with billed as (
         select
           i.job_id,
           sum(
             case
               when i.status = 'posted' and i.invoice_kind in ('main', 'adjustment') then i.total_amount
               when i.status = 'posted' and i.invoice_kind = 'credit' then -i.total_amount
               else 0
             end
           ) as net_billed
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
       order by "amountDue" desc
       limit $1`,
      [limit]
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

function roundMoney(value: string | number): number {
  return Math.round(Number(value) * 100) / 100;
}
