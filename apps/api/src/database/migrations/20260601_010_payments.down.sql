-- Migration: 20260601_010_payments (rollback)
drop index if exists payments_invoice_active_idx;
drop table if exists payments;
