-- Migration: 20260616_001_payment_receipt_messages
-- Outbox for customer-facing RECEIPT emails (payment + refund). This is a
-- SEPARATE transactional path from the estimate/invoice document pipeline,
-- which is PDF/document-shaped end to end (relay requires a document, the
-- worker hard-fails without a snapshot, outbound_messages requires an
-- estimate-or-invoice source). Receipts carry no PDF and no acceptance link.
--
-- A row is enqueued INSIDE the money transaction that records the payment or
-- refund (exactly-once), carrying only the pinned facts. A worker send-loop
-- later resolves the recipient (bill-to customer primary email), renders the
-- body from current company settings, pins recipient/subject/body on the first
-- attempt so retries do not drift, and sends via the relay.
--
-- "payment receipt" names the payments domain; the `kind` column distinguishes
-- payment-receipt rows from refund-receipt rows.

create table if not exists payment_receipt_messages (
  id text primary key,
  kind text not null check (kind in ('paymentReceipt', 'refundReceipt')),
  status text not null check (status in ('queued', 'sent', 'failed', 'canceled')),
  job_id text not null references jobs(id) on delete cascade,
  -- Exactly one money source, selected by kind: payment receipts reference a
  -- payment row; refund receipts reference a payment_refund row.
  payment_id text references payments(id) on delete cascade,
  payment_refund_id text references payment_refunds(id) on delete cascade,
  -- Facts pinned at enqueue time; the email's factual content never re-derives.
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method text not null,
  -- 'payment' vs 'deposit' for payment receipts; null for refund receipts
  -- (a refund has no deposit/payment purpose of its own).
  purpose text check (purpose is null or purpose in ('payment', 'deposit')),
  occurred_at timestamptz not null,
  -- Resolved + rendered on the FIRST send attempt, then pinned so a later retry
  -- reuses the exact recipient/copy even if settings or the email change after.
  recipient_email text,
  subject text,
  body_text text,
  -- Async send/retry bookkeeping (mirrors the outbound_messages queue shape).
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  expires_at timestamptz,
  provider_message_id text,
  provider_error text,
  sent_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint payment_receipt_messages_source_shape check (
    (kind = 'paymentReceipt' and payment_id is not null and payment_refund_id is null)
    or (kind = 'refundReceipt' and payment_refund_id is not null and payment_id is null)
  )
);

-- One receipt per money row: defense-in-depth on the exactly-once enqueue, so a
-- duplicated trigger (e.g. an at-least-once relay redelivery) cannot double-send.
create unique index if not exists payment_receipt_messages_payment_idx
  on payment_receipt_messages(payment_id)
  where payment_id is not null;

create unique index if not exists payment_receipt_messages_refund_idx
  on payment_receipt_messages(payment_refund_id)
  where payment_refund_id is not null;

-- Worker claims due queued rows ordered by next_attempt_at.
create index if not exists payment_receipt_messages_due_retry_idx
  on payment_receipt_messages(next_attempt_at)
  where status = 'queued';

create index if not exists payment_receipt_messages_job_created_idx
  on payment_receipt_messages(job_id, created_at desc);
