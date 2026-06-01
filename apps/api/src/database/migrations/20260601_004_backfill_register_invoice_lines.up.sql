-- Migration: 20260601_004_backfill_register_invoice_lines
-- Reflect pre-existing active register entries into their job's invoice draft.
--
-- Register-to-invoice reflection now happens automatically on every register
-- write, but register entries created before that wiring have no invoice line
-- yet. This backfills them once: each active register entry becomes a linked
-- invoice line (quantity 1 at unit_price = the register total_amount), exactly
-- as the runtime helper does.
--
-- Totals: this migration runs before tax/discount can reach an invoice (those
-- only arrive via estimate conversion, a later migration/feature), so every
-- invoice's discount/tax is zero here and the total is simply the sum of active
-- line subtotals. We therefore recompute header totals directly in SQL for the
-- zero-tax/zero-discount case only, and guard that precondition so this can
-- never silently mis-total a taxed/discounted invoice.

do $$
begin
  if exists (
    select 1 from invoices where tax_rate_basis_points <> 0 or discount_kind is not null
  ) then
    raise exception
      'Backfill precondition failed: an invoice already has tax or a discount; register-line backfill only handles the zero-tax/zero-discount case.';
  end if;
end $$;

-- 1. Insert one linked invoice line per active register entry that does not
--    already have one. line_position continues after any existing active lines.
with existing_max as (
  select invoice_id, max(line_position) as max_position
  from invoice_line_items
  where is_void = false
  group by invoice_id
),
candidates as (
  select
    re.id as register_entry_id,
    inv.id as invoice_id,
    re.kind,
    re.description,
    re.unit_of_measure,
    re.total_amount,
    re.part_number,
    re.inventory_source_label,
    re.created_at,
    row_number() over (partition by inv.id order by re.captured_at asc, re.created_at asc, re.id asc) - 1
      + coalesce(em.max_position + 1, 0) as line_position
  from register_entries re
  join invoices inv on inv.job_id = re.job_id and inv.invoice_kind = 'main'
  left join existing_max em on em.invoice_id = inv.id
  where re.is_void = false
    and not exists (
      select 1 from invoice_line_items ili
      where ili.source_register_entry_id = re.id
        and ili.source_sync_state = 'linked'
        and ili.is_void = false
    )
)
insert into invoice_line_items (
  id, invoice_id, line_position, kind, description, quantity, unit_of_measure,
  unit_price, unit_cost, taxable, part_number, inventory_source_label,
  line_subtotal_amount, line_cost_amount,
  source_kind, source_register_entry_id, source_sync_state,
  is_void, created_at, updated_at
)
select
  'invline-reg-' || c.register_entry_id,
  c.invoice_id,
  c.line_position,
  c.kind,
  c.description,
  1,
  c.unit_of_measure,
  c.total_amount,
  null,
  true,
  c.part_number,
  c.inventory_source_label,
  c.total_amount,
  null,
  'register',
  c.register_entry_id,
  'linked',
  false,
  c.created_at,
  c.created_at
from candidates c;

-- 2. Recompute affected invoice totals. Safe in SQL because the guard above
--    proved tax and discount are zero, so total == sum of active line subtotals
--    and the taxable base / tax / margin all fall out trivially.
update invoices inv
set
  subtotal_amount = agg.subtotal,
  taxable_base_amount = agg.subtotal,
  total_amount = agg.subtotal,
  total_cost_amount = 0,
  profit_amount = agg.subtotal,
  margin_basis_points = case when agg.subtotal > 0 then 10000 else null end,
  cost_complete = false,
  updated_at = inv.updated_at
from (
  select invoice_id, sum(line_subtotal_amount) as subtotal
  from invoice_line_items
  where is_void = false
  group by invoice_id
) agg
where agg.invoice_id = inv.id
  and exists (
    select 1 from invoice_line_items ili
    where ili.invoice_id = inv.id
      and ili.source_kind = 'register'
      and ili.is_void = false
  );
