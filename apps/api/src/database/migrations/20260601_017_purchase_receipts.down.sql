-- Migration: 20260601_017_purchase_receipts (rollback)
drop index if exists purchase_receipt_lines_receipt_idx;
drop table if exists purchase_receipt_lines;
drop index if exists purchase_receipts_po_idx;
drop table if exists purchase_receipts;
