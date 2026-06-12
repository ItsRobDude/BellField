-- Per-shop acceptance-link expiry (docs/acceptance-links-design.md): owner
-- decision 2026-06-12, bounded 7-90 days, default 30. The relay clamps the
-- same bounds as a second wall.
alter table company_settings
  add column acceptance_link_expiry_days integer not null default 30
    constraint company_settings_acceptance_expiry_range
    check (acceptance_link_expiry_days between 7 and 90);
