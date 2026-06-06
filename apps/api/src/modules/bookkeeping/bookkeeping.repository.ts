import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type { InvoiceKind } from '@bellfield/contracts';
import type { BookkeepingBalanceItemDto, BookkeepingInvoiceItemDto } from './bookkeeping.types';
import { queryOpenBalanceRows } from './open-balance-query';

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

@Injectable()
export class BookkeepingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Draft invoices that have at least one active line — candidates to post. Includes
   * main drafts and draft adjustment/credit corrections, so bookkeeping catches every
   * postable record cross-job (the row's invoiceKind says which).
   */
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
       where i.status = 'draft'
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
    // The open-balance math lives in a shared helper so the AR/open-balance report reuses the exact
    // same calculation (single source of truth — see open-balance-query.ts).
    return queryOpenBalanceRows(this.databaseService, limit);
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
