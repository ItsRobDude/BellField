-- Migration: 20260601_001_estimates
-- Estimates and their line items (Milestone 7).
--
-- An estimate is a job-owned, customer-facing financial record: a quoted
-- solution attached to a job and visible from the location. A job may have many
-- estimates. Pricing is computed by the shared @bellfield/estimating engine and
-- the resulting totals are SNAPSHOTTED onto these rows so a quoted figure never
-- silently changes if engine logic or tax rates move later. Money is numeric(12,2)
-- decimal dollars, matching register_entries and the rest of BellField.

create table if not exists estimates (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'declined')),
  title text not null check (length(trim(title)) > 0 and length(title) <= 160),
  description text check (description is null or length(description) <= 2000),

  -- Pricing settings the engine consumes.
  tax_rate_basis_points integer not null default 0 check (tax_rate_basis_points >= 0),
  -- Optional whole-estimate discount, stored as plain columns (not JSONB) so it
  -- stays queryable and validates cleanly. discount_kind drives which value applies:
  --   'percent' -> discount_basis_points, 'fixed' -> discount_amount.
  discount_kind text check (discount_kind in ('percent', 'fixed')),
  discount_basis_points integer check (discount_basis_points is null or discount_basis_points >= 0),
  discount_amount numeric(12, 2) check (discount_amount is null or discount_amount >= 0),
  valid_until date,

  -- Snapshotted engine output (see @bellfield/estimating). Recomputed and rewritten
  -- on every pending-state write; frozen once approved/declined.
  subtotal_amount numeric(12, 2) not null default 0 check (subtotal_amount >= 0),
  discount_amount_applied numeric(12, 2) not null default 0 check (discount_amount_applied >= 0),
  taxable_base_amount numeric(12, 2) not null default 0 check (taxable_base_amount >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  total_cost_amount numeric(12, 2) not null default 0 check (total_cost_amount >= 0),
  -- profit may be negative (a line can be priced below cost); margin_basis_points is
  -- null when there is no positive price to express a percentage against.
  profit_amount numeric(12, 2) not null default 0,
  margin_basis_points integer,
  cost_complete boolean not null default true,

  -- Lifecycle audit. Approval/decline freeze the record; names are snapshotted so
  -- history stays readable after employee changes (same pattern as register_entries).
  approved_at timestamptz,
  approved_by_employee_id text references employees(id),
  approved_by_name text,
  declined_at timestamptz,
  declined_by_employee_id text references employees(id),
  declined_by_name text,

  -- Cheap future-proofing: revisions clone into a new pending estimate
  -- (source_estimate_id), and an old estimate can point at the one that replaced
  -- it (superseded_by_estimate_id). No conversion-to-invoice fields yet; the
  -- invoice-draft entity does not exist, and approval must not auto-create records.
  source_estimate_id text references estimates(id) on delete set null,
  superseded_by_estimate_id text references estimates(id) on delete set null,

  created_by_employee_id text not null references employees(id),
  created_by_name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  -- Optimistic-concurrency / sync version, mirroring other field-synced entities.
  version integer not null default 1,

  -- Discount shape integrity: if a discount kind is set, exactly the matching value
  -- must be present; with no kind, neither value may be set.
  constraint estimates_discount_shape check (
    (discount_kind is null and discount_basis_points is null and discount_amount is null)
    or (discount_kind = 'percent' and discount_basis_points is not null and discount_amount is null)
    or (discount_kind = 'fixed' and discount_amount is not null and discount_basis_points is null)
  )
);

create index if not exists estimates_job_created_idx on estimates(job_id, created_at);
create index if not exists estimates_job_status_idx on estimates(job_id, status);

create table if not exists estimate_line_items (
  id text primary key,
  estimate_id text not null references estimates(id) on delete cascade,
  -- Stable ordering within an estimate; unique so positions never collide.
  line_position integer not null check (line_position >= 0),
  kind text not null check (kind in ('labor', 'serviceItem', 'part', 'equipment', 'membership', 'other')),
  description text not null check (length(trim(description)) > 0 and length(description) <= 500),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_of_measure text check (unit_of_measure is null or length(unit_of_measure) <= 40),
  -- unit_price is required on an estimate line (a quote always has a sell price);
  -- unit_cost is optional (cost may be unknown), which drives cost_complete above.
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  taxable boolean not null default true,
  part_number text check (part_number is null or length(part_number) <= 120),
  inventory_source_label text check (inventory_source_label is null or length(inventory_source_label) <= 120),

  -- Per-line snapshotted engine output.
  line_subtotal_amount numeric(12, 2) not null default 0 check (line_subtotal_amount >= 0),
  line_cost_amount numeric(12, 2) check (line_cost_amount is null or line_cost_amount >= 0),

  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists estimate_line_items_estimate_position_idx
  on estimate_line_items(estimate_id, line_position);
