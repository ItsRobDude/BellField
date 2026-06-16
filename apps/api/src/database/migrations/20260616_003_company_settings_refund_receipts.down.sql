alter table company_settings
  drop column if exists send_refund_receipts,
  drop column if exists refund_receipt_email_subject,
  drop column if exists refund_receipt_email_body;
