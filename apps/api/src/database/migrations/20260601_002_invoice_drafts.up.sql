-- Migration: 20260601_002_invoice_drafts
-- The single main invoice per job (Milestone 7, draft stage only).
--
-- Every job has exactly one main invoice draft, created eagerly when the job is
-- created (and backfilled here for existing jobs). The draft is the running bill
-- the job builds into; register entries reflect into it and an approved estimate
-- can be converted into it. Money is numeric(12,2) decimal dollars, matching the
-- rest of BellField, and totals are snapshotted by the pricing layer on write.
--
-- Scope note: `status` includes 'posted' so the M8 posting/lock work does not need
-- a schema change, but this milestone never transitions a draft to posted. The
-- customer/location/job display snapshot the invoice invariant calls for is
-- deferred to posting (M8): a draft is live and the job detail resolves current
-- names, so freezing context only matters once an invoice is posted.

create table if not exists invoices (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  -- 'main' is the one-per-job invoice. Adjustment/credit kinds arrive post-M8;
  -- naming the kind now keeps the unique-main constraint stable for the future.
  invoice_kind text not null default 'main' check (invoice_kind in ('main')),
  status text not null default 'draft' check (status in ('draft', 'posted')),

  -- Pricing settings + snapshotted engine totals, same shape as estimates so the
  -- two stay consistent and a converted estimate maps field-for-field.
  tax_rate_basis_points integer not null default 0 check (tax_rate_basis_points >= 0),
  discount_kind text check (discount_kind in ('percent', 'fixed')),
  discount_basis_points integer check (discount_basis_points is null or discount_basis_points >= 0),
  discount_amount numeric(12, 2) check (discount_amount is null or discount_amount >= 0),

  subtotal_amount numeric(12, 2) not null default 0 check (subtotal_amount >= 0),
  discount_amount_applied numeric(12, 2) not null default 0 check (discount_amount_applied >= 0),
  taxable_base_amount numeric(12, 2) not null default 0 check (taxable_base_amount >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  total_cost_amount numeric(12, 2) not null default 0 check (total_cost_amount >= 0),
  -- profit may be negative; margin is null when there is no positive price.
  profit_amount numeric(12, 2) not null default 0,
  margin_basis_points integer,
  cost_complete boolean not null default true,

  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,

  constraint invoices_discount_shape check (
    (discount_kind is null and discount_basis_points is null and discount_amount is null)
    or (discount_kind = 'percent' and discount_basis_points is not null and discount_amount is null)
    or (discount_kind = 'fixed' and discount_amount is not null and discount_basis_points is null)
  )
);

-- One main invoice per job, enforced by the database (not just the service).
create unique index if not exists invoices_one_main_per_job_idx
  on invoices(job_id)
  where invoice_kind = 'main';

create index if not exists invoices_job_idx on invoices(job_id);

create table if not exists invoice_line_items (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  line_position integer not null check (line_position >= 0),
  kind text not null check (kind in ('labor', 'serviceItem', 'part', 'equipment', 'membership', 'other')),
  description text not null check (length(trim(description)) > 0 and length(description) <= 500),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_of_measure text check (unit_of_measure is null or length(unit_of_measure) <= 40),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  -- Cost is optional (register lines have none; estimate lines may). Keeping it
  -- preserves job-costing history when an estimate is converted.
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  taxable boolean not null default true,
  part_number text check (part_number is null or length(part_number) <= 120),
  inventory_source_label text check (inventory_source_label is null or length(inventory_source_label) <= 120),

  -- Per-line snapshotted amounts (engine output).
  line_subtotal_amount numeric(12, 2) not null default 0 check (line_subtotal_amount >= 0),
  line_cost_amount numeric(12, 2) check (line_cost_amount is null or line_cost_amount >= 0),

  -- Provenance: where this line came from, so register reflection and estimate
  -- conversion can do the right thing without clobbering manual billing edits.
  --   source_kind  manual   -> office typed it directly
  --                register -> reflected from a register_entries row
  --                estimate -> copied from a converted estimate
  --   source_sync_state  linked   -> still mirrors its source; source edits flow in
  --                      detached -> office edited it; source edits must not overwrite
  source_kind text not null default 'manual' check (source_kind in ('manual', 'register', 'estimate')),
  source_register_entry_id text references register_entries(id) on delete set null,
  source_estimate_id text references estimates(id) on delete set null,
  source_estimate_line_item_id text references estimate_line_items(id) on delete set null,
  source_sync_state text not null default 'linked' check (source_sync_state in ('linked', 'detached')),

  -- Soft-void so history is preserved (mirrors register/media void behavior).
  is_void boolean not null default false,
  void_reason text check (void_reason is null or length(void_reason) <= 500),

  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists invoice_line_items_invoice_position_idx
  on invoice_line_items(invoice_id, line_position);

-- At most one linked (non-detached, non-void) invoice line per register entry, so
-- register reflection stays idempotent and cannot create duplicate billing lines.
create unique index if not exists invoice_line_items_register_source_idx
  on invoice_line_items(source_register_entry_id)
  where source_register_entry_id is not null and source_sync_state = 'linked' and is_void = false;

-- Backfill: every existing job gets its one main invoice draft now, so the
-- one-invoice-per-job invariant holds uniformly (job-create handles new jobs).
insert into invoices (id, job_id, invoice_kind, status, created_at, updated_at, version)
select
  'invoice-main-' || j.id,
  j.id,
  'main',
  'draft',
  j.created_at,
  j.created_at,
  1
from jobs j
where not exists (
  select 1 from invoices i where i.job_id = j.id and i.invoice_kind = 'main'
);
