-- Migration: 20260616_003_company_settings_refund_receipts
-- Refund-receipt email settings: a toggle (default on) and the subject/body
-- templates the worker renders when sending a customer refund receipt. The
-- default copy intentionally omits a payment method — a manual refund carries no
-- refund-method field (it records the original payment's method), so claiming
-- "refunded by <method>" could be inaccurate.

alter table company_settings
  add column send_refund_receipts boolean not null default true,
  add column refund_receipt_email_subject text not null default 'Refund from {companyName}',
  add column refund_receipt_email_body text not null default
    E'Hello {customerName},\n\nWe issued a refund of {amount} on {date} for job {jobNumber}.\n\nThank you,\n{companyName}';
