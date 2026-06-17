import { ConflictException } from '@nestjs/common';
import { type QueryExecutor } from '../../database/database.service';
import type { InvoiceKindValue } from './invoices.types';

// Human prefix per posted invoice kind. All three kinds draw the same shared
// counter (invoice_number_series); only the prefix differs, so a credit reads as
// 'CR-1043' while still sharing one gapless sequence (the Xero model). Fixed in
// v1; configurable copy is a later slice.
const INVOICE_NUMBER_PREFIXES: Record<InvoiceKindValue, string> = {
  main: 'INV-',
  adjustment: 'ADJ-',
  credit: 'CR-'
};

/**
 * Reserve the next shared invoice number and stamp it on the just-posted invoice.
 * Call inside the post transaction: the single-statement increment
 * (`next_value = next_value + 1` returning the prior value) takes a row lock, so
 * concurrent posts serialize and a rolled-back post leaves no gap. The prefix is
 * chosen by kind; the raw integer is shared across all kinds.
 */
export async function assignInvoiceNumber(
  queryable: QueryExecutor,
  invoiceId: string,
  kind: InvoiceKindValue,
  now: string
): Promise<void> {
  const reserved = await queryable.query<{ assigned: string }>(
    `update invoice_number_series
       set next_value = next_value + 1,
           updated_at = $1
     where id = 'default'
     returning (next_value - 1)::bigint as "assigned"`,
    [now]
  );
  const assigned = reserved.rows[0]?.assigned;
  if (assigned === undefined) {
    // The single seeded row is created by the numbering migration; its absence
    // is a real data-integrity fault, not something to paper over.
    throw new ConflictException('Invoice number series is not initialized.');
  }
  const invoiceNumber = `${INVOICE_NUMBER_PREFIXES[kind]}${assigned}`;
  await queryable.query(
    `update invoices
       set invoice_sequence = $2,
           invoice_number = $3
     where id = $1`,
    [invoiceId, assigned, invoiceNumber]
  );
}

/** The number that will be issued to the next posted invoice. */
export async function getNextInvoiceNumber(queryable: QueryExecutor): Promise<number> {
  const result = await queryable.query<{ nextValue: string }>(
    `select next_value as "nextValue" from invoice_number_series where id = 'default' limit 1`
  );
  const raw = result.rows[0]?.nextValue;
  if (raw === undefined) {
    throw new ConflictException('Invoice number series is not initialized.');
  }
  return Number(raw);
}

/**
 * Set the next number (e.g. a migrating shop continuing its existing series).
 * Guarded so it can only move FORWARD past every number already issued — setting
 * it at or below the highest issued sequence would risk reusing a number (and is
 * rejected by the unique index anyway). Returns the new next number.
 */
export async function setNextInvoiceNumber(
  queryable: QueryExecutor,
  nextNumber: number,
  now: string
): Promise<number> {
  const result = await queryable.query<{ nextValue: string }>(
    `update invoice_number_series
       set next_value = $1,
           updated_at = $2
     where id = 'default'
       and $1 > coalesce((select max(invoice_sequence) from invoices), 0)
     returning next_value as "nextValue"`,
    [nextNumber, now]
  );
  const raw = result.rows[0]?.nextValue;
  if (raw === undefined) {
    throw new ConflictException(
      'The next invoice number must be greater than the highest number already issued.'
    );
  }
  return Number(raw);
}
