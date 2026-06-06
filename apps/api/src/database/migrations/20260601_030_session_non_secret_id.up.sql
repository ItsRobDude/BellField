-- A non-secret identifier for sessions so the admin "Employees" surface can list and revoke a device
-- session without ever exposing the bearer token. The token stays the table's primary key and the auth
-- lookup key; `id` is what the API surfaces to clients.
alter table sessions add column if not exists id text;
-- Backfill with a built-in deterministic hash (no pgcrypto/gen_random_uuid dependency, so this runs on
-- any self-hosted Postgres). The token is already unique, so the derived id is unique too. New sessions
-- get an app-side randomUUID() in createSession.
update sessions
  set id = md5(token || ':' || employee_id || ':' || issued_at::text)
  where id is null;
alter table sessions alter column id set not null;
create unique index if not exists sessions_id_key on sessions (id);
