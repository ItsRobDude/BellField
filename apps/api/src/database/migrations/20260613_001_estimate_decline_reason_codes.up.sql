alter table estimates
  add column if not exists decline_reason_codes jsonb;

alter table estimates
  add constraint estimates_decline_reason_codes_shape
  check (
    decline_reason_codes is null
    or (
      jsonb_typeof(decline_reason_codes) = 'array'
      and decline_reason_codes <@ '["price", "otherCompany", "postponing", "questions"]'::jsonb
    )
  );
