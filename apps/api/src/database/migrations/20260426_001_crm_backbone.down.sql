drop index if exists locations_name_idx;
drop index if exists contacts_display_name_idx;
drop index if exists customers_name_idx;

drop table if exists location_ownership_history;
drop table if exists location_contact_links;
drop table if exists customer_contact_links;

alter table locations
  drop column if exists is_active,
  drop column if exists fax,
  drop column if exists email,
  drop column if exists phone;

alter table contacts
  drop column if exists fax;

alter table customers
  drop column if exists fax,
  drop column if exists billing_postal_code,
  drop column if exists billing_state,
  drop column if exists billing_city,
  drop column if exists billing_address_line1;
