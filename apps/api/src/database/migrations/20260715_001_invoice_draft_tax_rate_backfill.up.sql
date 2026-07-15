-- Migration: 20260715_001_invoice_draft_tax_rate_backfill
-- Fix the invoice tax-rate inheritance gap (2026-07-14 gap-analysis pass, task T0-1):
-- invoice drafts were created with the column default of 0 basis points and only
-- estimate conversion ever wrote a header rate, so register-first/manual main
-- drafts and every draft adjustment/credit computed $0 sales tax.
--
-- Code-side fixes land with this migration (draft creation seeds from company
-- settings; adjustments/credits inherit the corrected invoice's frozen rate).
-- This backfill repairs the drafts that already exist. Scope is deliberately
-- narrow and posted invoices are never touched:
--
-- 1) MAIN drafts still at 0 bps adopt the company default, but only when the
--    company charges sales tax and the draft has no active estimate-sourced
--    lines. Estimate-converted drafts are excluded because their header terms
--    were adopted from the estimate deliberately — a 0 there may be an explicit
--    choice.
-- 2) Draft adjustments/credits still at 0 bps inherit the rate frozen on the
--    posted invoice they correct (same document, same tax treatment).
-- 3) Drafts with active lines get their stored totals recomputed in place; the
--    totals math is only attempted for discount-free drafts, where the pricing
--    engine's result is exactly: taxable base = sum of active taxable line
--    subtotals; tax = round(taxable_base * bps / 10000, 2); total = subtotal +
--    tax. Postgres round() on numeric is half-away-from-zero, which equals the
--    engine's half-up rounding for these non-negative amounts
--    (packages/estimating/src/money.ts roundCents). Drafts with no active
--    lines get the rate only — their stored totals are already zero, and the
--    shared engine recomputes on the next line write.
--
-- (An UPDATE target cannot be referenced from LATERAL in Postgres, so the
-- per-invoice taxable base comes from a grouped derived table; that inner join
-- is also why the no-active-line drafts need their own rate-only statements.)

-- 1a) Main drafts WITH active lines: seed the company rate and recompute totals.
with company_rate as (
  select
    case when charges_sales_tax then default_sales_tax_basis_points else 0 end as bps
  from company_settings
  limit 1
)
update invoices inv
set
  tax_rate_basis_points = cr.bps,
  taxable_base_amount = t.taxable_base,
  tax_amount = round(t.taxable_base * cr.bps / 10000::numeric, 2),
  total_amount = inv.subtotal_amount + round(t.taxable_base * cr.bps / 10000::numeric, 2),
  updated_at = now(),
  version = inv.version + 1
from company_rate cr,
  (
    select
      ili.invoice_id,
      coalesce(sum(case when ili.taxable then ili.line_subtotal_amount else 0 end), 0)
        as taxable_base
    from invoice_line_items ili
    where ili.is_void = false
    group by ili.invoice_id
  ) t
where t.invoice_id = inv.id
  and inv.invoice_kind = 'main'
  and inv.status = 'draft'
  and inv.tax_rate_basis_points = 0
  and inv.discount_kind is null
  and cr.bps > 0
  and not exists (
    select 1
    from invoice_line_items est
    where est.invoice_id = inv.id
      and est.source_kind = 'estimate'
      and est.is_void = false
  );

-- 1b) Main drafts with NO active lines: seed the rate only (totals stay zero).
with company_rate as (
  select
    case when charges_sales_tax then default_sales_tax_basis_points else 0 end as bps
  from company_settings
  limit 1
)
update invoices inv
set
  tax_rate_basis_points = cr.bps,
  updated_at = now(),
  version = inv.version + 1
from company_rate cr
where inv.invoice_kind = 'main'
  and inv.status = 'draft'
  and inv.tax_rate_basis_points = 0
  and cr.bps > 0
  and not exists (
    select 1
    from invoice_line_items ili
    where ili.invoice_id = inv.id
      and ili.is_void = false
  );

-- 2a) Draft adjustments/credits WITH active lines: inherit the corrected
--     invoice's frozen rate and recompute totals.
update invoices adj
set
  tax_rate_basis_points = parent.tax_rate_basis_points,
  taxable_base_amount = t.taxable_base,
  tax_amount = round(t.taxable_base * parent.tax_rate_basis_points / 10000::numeric, 2),
  total_amount = adj.subtotal_amount
    + round(t.taxable_base * parent.tax_rate_basis_points / 10000::numeric, 2),
  updated_at = now(),
  version = adj.version + 1
from invoices parent,
  (
    select
      ili.invoice_id,
      coalesce(sum(case when ili.taxable then ili.line_subtotal_amount else 0 end), 0)
        as taxable_base
    from invoice_line_items ili
    where ili.is_void = false
    group by ili.invoice_id
  ) t
where t.invoice_id = adj.id
  and adj.invoice_kind in ('adjustment', 'credit')
  and adj.status = 'draft'
  and adj.tax_rate_basis_points = 0
  and adj.discount_kind is null
  and parent.id = adj.adjusts_invoice_id
  and parent.tax_rate_basis_points > 0;

-- 2b) Draft adjustments/credits with NO active lines: inherit the rate only.
update invoices adj
set
  tax_rate_basis_points = parent.tax_rate_basis_points,
  updated_at = now(),
  version = adj.version + 1
from invoices parent
where adj.invoice_kind in ('adjustment', 'credit')
  and adj.status = 'draft'
  and adj.tax_rate_basis_points = 0
  and parent.id = adj.adjusts_invoice_id
  and parent.tax_rate_basis_points > 0
  and not exists (
    select 1
    from invoice_line_items ili
    where ili.invoice_id = adj.id
      and ili.is_void = false
  );
