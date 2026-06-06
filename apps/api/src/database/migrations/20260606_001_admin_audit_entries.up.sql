-- Migration: 20260606_001_admin_audit_entries
-- Append-only audit trail for sensitive identity-access admin writes (M10 slice 4C). Stores WHO did
-- WHAT to WHOM with a non-secret summary — never passwords, bearer tokens, or request bodies. Actor
-- and target names/emails are denormalized so the trail survives renames/deletes; the employee FKs
-- set null on delete so a removed employee doesn't take the history with them.
create table if not exists admin_audit_entries (
  id text primary key,
  occurred_at timestamptz not null,
  actor_employee_id text references employees(id) on delete set null,
  actor_name text not null,
  actor_email text not null,
  target_employee_id text references employees(id) on delete set null,
  target_name text not null,
  target_email text not null,
  action text not null check (
    action in (
      'employee_created',
      'employee_role_changed',
      'employee_activated',
      'employee_deactivated',
      'employee_overrides_changed',
      'employee_password_reset',
      'employee_session_revoked'
    )
  ),
  summary text not null
);

create index if not exists admin_audit_entries_occurred_at_idx on admin_audit_entries (occurred_at desc);
create index if not exists admin_audit_entries_actor_idx on admin_audit_entries (actor_employee_id);
create index if not exists admin_audit_entries_target_idx on admin_audit_entries (target_employee_id);
create index if not exists admin_audit_entries_action_idx on admin_audit_entries (action);

-- Case-insensitive unique email: login/create look employees up via lower(email), but the existing
-- unique is case-sensitive, so 'Owner@x' and 'owner@x' could both exist. Coexists with unique(email).
create unique index if not exists employees_lower_email_key on employees (lower(email));
