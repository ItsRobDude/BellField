alter table online_payment_sessions drop column if exists purpose;
alter table payments drop column if exists purpose;
