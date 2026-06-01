-- Migration: 20260601_002_invoice_drafts (rollback)
-- Drop line items first (FK -> invoices), then invoices.
drop table if exists invoice_line_items;
drop table if exists invoices;
