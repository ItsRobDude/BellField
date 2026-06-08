-- Migration: 20260608_003_estimate_options
-- Adds trade-neutral estimate option groups for good/better/best style selling.
--
-- Option definitions live on the estimate as a JSON snapshot so approved and
-- declined alternatives remain readable later. Line membership is stored on the
-- line rows so conversion can copy only the approved option path.

alter table estimates
  add column if not exists option_groups jsonb,
  add column if not exists selected_option_id text;

alter table estimates
  add constraint estimates_option_groups_array
  check (option_groups is null or jsonb_typeof(option_groups) = 'array');

alter table estimate_line_items
  add column if not exists option_group_id text,
  add column if not exists option_id text;

alter table estimate_line_items
  add constraint estimate_line_items_option_membership_pair
  check (
    (option_group_id is null and option_id is null)
    or (option_group_id is not null and option_id is not null)
  );

create index if not exists estimate_line_items_option_idx
  on estimate_line_items(estimate_id, option_group_id, option_id)
  where option_id is not null;
