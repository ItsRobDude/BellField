alter table if exists company_settings
  add column if not exists charges_sales_tax boolean not null default false,
  add column if not exists default_sales_tax_basis_points integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_settings_default_sales_tax_basis_points_range'
  ) then
    alter table company_settings
      add constraint company_settings_default_sales_tax_basis_points_range
      check (default_sales_tax_basis_points >= 0 and default_sales_tax_basis_points <= 2500);
  end if;
end $$;
