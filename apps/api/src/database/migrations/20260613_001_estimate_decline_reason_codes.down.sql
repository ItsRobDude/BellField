alter table estimates
  drop constraint if exists estimates_decline_reason_codes_shape;

alter table estimates
  drop column if exists decline_reason_codes;
