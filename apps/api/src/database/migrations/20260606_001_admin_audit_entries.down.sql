-- Migration: 20260606_001_admin_audit_entries (rollback)
drop index if exists employees_lower_email_key;
drop table if exists admin_audit_entries;
