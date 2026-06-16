alter table company_settings
  drop column if exists send_payment_receipts,
  drop column if exists payment_receipt_email_subject,
  drop column if exists payment_receipt_email_body;
