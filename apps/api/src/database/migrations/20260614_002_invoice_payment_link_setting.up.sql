-- Owner policy (decided 2026-06-14): when on, invoice emails embed an online
-- pay-now link for posted main invoices with an outstanding balance. Defaults
-- off so links are only created once the owner enables the policy (and the
-- shop's payments are actually configured).
alter table company_settings
  add column include_invoice_payment_link boolean not null default false;
