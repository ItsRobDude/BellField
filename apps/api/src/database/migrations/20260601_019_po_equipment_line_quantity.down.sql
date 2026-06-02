-- Migration: 20260601_019_po_equipment_line_quantity (rollback)
alter table purchase_order_lines drop constraint if exists purchase_order_lines_equipment_quantity;
