drop table if exists integration_secrets;

alter table if exists company_settings
  drop column if exists customer_facing_sender_name,
  drop column if exists customer_facing_from_email;
