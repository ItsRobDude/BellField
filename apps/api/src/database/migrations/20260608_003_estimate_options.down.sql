drop index if exists estimate_line_items_option_idx;

alter table estimate_line_items
  drop constraint if exists estimate_line_items_option_membership_pair;

alter table estimate_line_items
  drop column if exists option_id,
  drop column if exists option_group_id;

alter table estimates
  drop constraint if exists estimates_option_groups_array;

alter table estimates
  drop column if exists selected_option_id,
  drop column if exists option_groups;
