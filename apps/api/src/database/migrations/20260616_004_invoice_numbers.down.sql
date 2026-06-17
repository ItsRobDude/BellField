drop index if exists invoices_invoice_sequence_idx;
drop index if exists invoices_invoice_number_idx;

alter table invoices drop constraint if exists invoices_invoice_number_shape;

alter table invoices
  drop column if exists invoice_number,
  drop column if exists invoice_sequence;

drop table if exists invoice_number_series;
