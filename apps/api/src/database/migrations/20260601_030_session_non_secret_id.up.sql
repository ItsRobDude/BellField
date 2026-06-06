-- A non-secret identifier for sessions so the admin "Employees" surface can list and revoke a device
-- session without ever exposing the bearer token. The token stays the table's primary key and the auth
-- lookup key; `id` is what the API surfaces to clients.
alter table sessions add column if not exists id text;
update sessions set id = gen_random_uuid()::text where id is null;
alter table sessions alter column id set not null;
create unique index if not exists sessions_id_key on sessions (id);
