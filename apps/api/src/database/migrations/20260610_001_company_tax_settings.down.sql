alter table if exists company_settings
  drop constraint if exists company_settings_default_sales_tax_basis_points_range,
  drop column if exists default_sales_tax_basis_points,
  drop column if exists charges_sales_tax;
