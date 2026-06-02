-- Migration: 20260601_014_purchase_orders (rollback)
drop index if exists purchase_order_lines_po_idx;
drop table if exists purchase_order_lines;
drop index if exists purchase_orders_job_idx;
drop index if exists purchase_orders_status_idx;
drop table if exists purchase_orders;
