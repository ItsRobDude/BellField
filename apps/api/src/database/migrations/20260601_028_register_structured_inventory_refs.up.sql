-- Migration: 20260601_028_register_structured_inventory_refs
-- Slice 1b (field truck-picker). A field-captured part line can now carry the STRUCTURED
-- inventory item + stock location the technician picked from their truck, not just the
-- free-text part_number / inventory_source_label. When both are present on a 'part' line the
-- server can auto-cost it as a tracked-inventory issue at capture time (issueToJob at
-- weighted-average cost) instead of leaving it for office resolution.
--
-- Additive and nullable: existing free-text lines are unaffected. on delete set null so a
-- later item/location removal never breaks the historical register row.

alter table register_entries
  add column if not exists inventory_item_id text
    references inventory_items(id) on delete set null,
  add column if not exists inventory_location_id text
    references inventory_locations(id) on delete set null;
