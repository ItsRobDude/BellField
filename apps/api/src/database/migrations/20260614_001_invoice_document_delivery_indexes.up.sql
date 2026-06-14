create index if not exists customer_document_snapshots_invoice_created_idx
  on customer_document_snapshots(invoice_id, created_at desc)
  where invoice_id is not null;

create index if not exists outbound_messages_invoice_created_idx
  on outbound_messages(invoice_id, created_at desc)
  where invoice_id is not null;
