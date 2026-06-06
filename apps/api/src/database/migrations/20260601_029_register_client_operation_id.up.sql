-- Migration: 20260601_029_register_client_operation_id
-- Server-visible idempotency key for field-originated register-entry creates. The field app
-- already carries a stable local id per queued operation; persisting it here lets a re-drained
-- create (after a committed-but-lost response) return the existing line instead of inserting a
-- duplicate. This matters now that a register create can drive both the customer invoice and an
-- auto-cost issue-to-job: a duplicate would double-bill AND double-issue truck stock.
--
-- Nullable + additive: office-created and existing rows carry no key. The partial unique index
-- enforces one row per non-null key as the integrity backstop behind the check-first dedup.

alter table register_entries
  add column if not exists client_operation_id text;

create unique index if not exists register_entries_client_operation_id_key
  on register_entries (client_operation_id)
  where client_operation_id is not null;
