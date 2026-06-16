-- Migration: 20260616_002_company_settings_payment_receipts
-- Payment-receipt email settings: a toggle (default on) and the subject/body
-- templates the worker renders when sending a customer payment/deposit receipt.
-- Refund-receipt settings arrive in a later slice. Defaults backfill the
-- existing settings row; new rows are written through the settings upsert.

alter table company_settings
  add column send_payment_receipts boolean not null default true,
  add column payment_receipt_email_subject text not null default 'Receipt from {companyName}',
  add column payment_receipt_email_body text not null default
    E'Hello {customerName},\n\nWe received your {receiptKind} of {amount} by {method} on {date} for job {jobNumber}.\n\nThank you,\n{companyName}';
