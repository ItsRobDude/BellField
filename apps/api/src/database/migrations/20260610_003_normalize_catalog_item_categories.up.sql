-- The 20260610_002 backfill created managed categories from item text using
-- min(trim(name)) per case-insensitive group, but left item rows with their
-- original casing/whitespace (e.g. items tagged 'hvac' under managed 'HVAC').
-- Pickers tolerate that via lowercased keys, but the item edit form's select
-- matches on the exact string and showed "No category" for variants. Align
-- item text to the managed display name once; new writes stay aligned because
-- category renames now cascade to items.
update catalog_items ci
set category = cc.name,
    updated_at = now()
from catalog_categories cc
where ci.category is not null
  and lower(trim(ci.category)) = lower(cc.name)
  and ci.category is distinct from cc.name;
