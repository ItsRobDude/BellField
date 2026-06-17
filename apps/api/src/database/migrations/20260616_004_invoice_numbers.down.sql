drop index if exists invoices_invoice_number_idx;

alter table invoices
  drop column if exists invoice_number,
  drop column if exists invoice_sequence;

drop table if exists invoice_number_series;
