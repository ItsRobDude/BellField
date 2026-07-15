-- Migration: 20260715_002_invoice_discounted_draft_tax_backfill
-- Follow-up to 20260715_001, whose forward file is already committed and may
-- already be recorded as applied. That migration deliberately limited totals
-- recomputation to discount-free drafts, which left discounted drafts with
-- active lines at 0 basis points. A separate migration makes already-migrated
-- and fresh databases converge without rewriting migration history.
--
-- The pricing engine computed taxable_base_amount before this repair even when
-- the tax rate was 0. For discounted drafts, that stored value is the
-- proportionally allocated taxable share of the discounted subtotal. Reuse it
-- here rather than duplicating discount allocation in SQL.
--
-- As in 001, posted invoices and drafts with an intentional nonzero rate are
-- never touched. Estimate-converted mains remain excluded because their adopted
-- tax terms may deliberately carry a 0 rate.

-- 1) Discounted manual main drafts inherit the current company rate.
with company_rate as (
  select
    case when charges_sales_tax then default_sales_tax_basis_points else 0 end as bps
  from company_settings
  limit 1
)
update invoices inv
set
  tax_rate_basis_points = cr.bps,
  tax_amount = round(inv.taxable_base_amount * cr.bps / 10000::numeric, 2),
  total_amount = inv.subtotal_amount - inv.discount_amount_applied
    + round(inv.taxable_base_amount * cr.bps / 10000::numeric, 2),
  updated_at = now(),
  version = inv.version + 1
from company_rate cr
where inv.invoice_kind = 'main'
  and inv.status = 'draft'
  and inv.tax_rate_basis_points = 0
  and inv.discount_kind is not null
  and cr.bps > 0
  and exists (
    select 1
    from invoice_line_items ili
    where ili.invoice_id = inv.id
      and ili.is_void = false
  )
  and not exists (
    select 1
    from invoice_line_items est
    where est.invoice_id = inv.id
      and est.source_kind = 'estimate'
      and est.is_void = false
  );

-- 2) Discounted draft adjustments/credits inherit their posted parent's rate.
update invoices adj
set
  tax_rate_basis_points = parent.tax_rate_basis_points,
  tax_amount = round(
    adj.taxable_base_amount * parent.tax_rate_basis_points / 10000::numeric,
    2
  ),
  total_amount = adj.subtotal_amount - adj.discount_amount_applied
    + round(adj.taxable_base_amount * parent.tax_rate_basis_points / 10000::numeric, 2),
  updated_at = now(),
  version = adj.version + 1
from invoices parent
where adj.invoice_kind in ('adjustment', 'credit')
  and adj.status = 'draft'
  and adj.tax_rate_basis_points = 0
  and adj.discount_kind is not null
  and parent.id = adj.adjusts_invoice_id
  and parent.tax_rate_basis_points > 0
  and exists (
    select 1
    from invoice_line_items ili
    where ili.invoice_id = adj.id
      and ili.is_void = false
  );
