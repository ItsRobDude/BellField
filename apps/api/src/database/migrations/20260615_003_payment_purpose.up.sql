-- Migration: 20260615_003_payment_purpose
-- Add a durable "purpose" to payments and online payment sessions: WHAT the money
-- was collected as, distinct from the method (card/cash/check) and the source
-- (manual/bellfield_payments). 'deposit' is money taken toward a job (often before
-- an invoice is posted); 'payment' is an ordinary receipt.
--
-- This is business meaning, not UI sugar: after this migration, surfaces must read
-- `purpose` rather than inferring "deposit" from a null invoice_id. Refunds are NOT
-- a purpose here — they remain their own ledger entry (payment_refunds).

alter table payments
  add column if not exists purpose text not null default 'payment'
    check (purpose in ('payment', 'deposit'));

alter table online_payment_sessions
  add column if not exists purpose text not null default 'payment'
    check (purpose in ('payment', 'deposit'));

-- Backfill the deposit links created before this column existed, and the payments
-- they produced. A deposit link is the only way to get a job-level (null invoice)
-- online session, so null invoice_id is a safe one-time backfill signal. New rows
-- default to 'payment'; nothing else is touched.
update online_payment_sessions
  set purpose = 'deposit'
  where invoice_id is null;

update payments
  set purpose = 'deposit'
  where id in (
    select payment_id
    from online_payment_sessions
    where invoice_id is null and payment_id is not null
  );
