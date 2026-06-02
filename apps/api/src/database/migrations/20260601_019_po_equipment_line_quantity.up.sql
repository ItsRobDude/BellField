-- Migration: 20260601_019_po_equipment_line_quantity
-- Structurally enforce one physical asset per equipment line: an equipment purchase-order
-- line must have quantity 1 (parts are unrestricted beyond > 0). The service already
-- enforces this, but a DB check protects future import/admin paths that bypass it.

alter table purchase_order_lines
  add constraint purchase_order_lines_equipment_quantity check (
    kind <> 'equipment' or quantity = 1
  );
