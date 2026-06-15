# Refunds Design

Status: design (2026-06-14). Controlling doc for the refunds slice of the
money-path-depth lane. Decisions confirmed with Rob via Q&A on 2026-06-14.

## What this adds

A way to return money that was already received on a job — for both
provider-confirmed card payments (through Stripe, via the relay) and manually
recorded payments (cash/check returned). Refunds may be **full or partial**, are
**permission-gated**, and never rewrite a posted invoice — they are append-only
ledger entries, exactly like payments.

## Decisions (locked)

- **Scope of the first pass:** online (Stripe) **and** manual refunds; full
  **or** partial amounts; gated behind a new `payments:refund` permission.
- **Application fee on a card refund:** refunded **proportionally**. When a shop
  refunds a customer's card payment, BellField returns its application fee for
  the refunded portion (Stripe `refund_application_fee` / proportional). The shop
  is never out-of-pocket for refunding its own customer. (Matches the
  "we don't skim your revenue" posture.)
- **Refunds are terminal in v1** — a recorded refund is not itself voidable. An
  erroneous _manual_ refund is rare and can be corrected by a compensating
  manual payment; revisit if it becomes a real need.
- **Card payments keep the existing rule:** they cannot be manually voided; the
  refund is their reversal path. Void stays the error-correction path for manual
  payments only.

## Money model

A payment today is a job-level append-only row (`payments`, `amount > 0`,
`is_void` flag) with `payment_allocations` spreading the receipt across posted
charge invoices (`main` + `adjustment`). Net paid for a job is the sum of
non-void `payments.amount`; per-invoice "allocated" is the sum of allocations on
non-void payments. See `20260601_010_payments` and `20260613_002_payment_allocations`.

A refund mirrors this with two new tables:

### `payment_refunds`

One row per confirmed refund, linked to the payment it reverses.

- `id text primary key`
- `payment_id text not null references payments(id) on delete restrict`
- `job_id text not null references jobs(id) on delete restrict` — denormalized so
  job-level sums never need the join (mirrors `payments.job_id`)
- `amount numeric(12,2) not null check (amount > 0)` — the refunded magnitude
- `method text not null check (method in ('cash','check','card','ach','other'))`
- `source text not null check (source in ('manual','bellfield_payments'))`
- `provider text check (provider is null or provider in ('stripe'))`
- `provider_refund_id text` — Stripe refund id; unique when present
- `provider_payment_id text` — the Stripe payment/charge being refunded (online)
- `application_fee_refunded numeric(12,2)` — the proportional fee returned (online)
- `reason text`
- `refunded_by_employee_id text references employees(id)` — null for system/online
- `refunded_by_name text not null` (e.g. "BellField Payments" for online)
- `refunded_at timestamptz not null`
- `created_at`, `updated_at timestamptz not null`
- shape constraint mirroring payments: `source = 'bellfield_payments'` ⇒
  `provider = 'stripe' and provider_refund_id is not null`; `source = 'manual'`
  ⇒ `refunded_by_employee_id is not null and provider is null`.
- unique index on `(provider, provider_refund_id)` where present — the worker
  records each Stripe refund event exactly once (idempotent, like payments).

A `payment_refunds` row always represents a **confirmed** refund: a manual refund
is confirmed when the office records it; an online refund row is created by the
worker only when a Stripe refund event is confirmed (see Online flow). Pending
online refunds are tracked separately (slice 2), never as a half-real refund row.

### `payment_refund_allocations`

Reverses the original payment's allocations so per-invoice balances stay exact.

- `id text primary key`
- `refund_id text not null references payment_refunds(id) on delete restrict`
- `invoice_id text not null references invoices(id) on delete restrict`
- `amount numeric(12,2) not null check (amount > 0)`
- `created_at timestamptz not null`
- unique `(refund_id, invoice_id)`

At refund time we walk the payment's existing allocations **main-first** (same
order auto-allocation uses) and reverse up to the refund amount, producing one
refund-allocation per touched invoice. A full refund reverses all of the
payment's allocations; a partial refund reverses the first N dollars. This keeps
the reversal deterministic and explainable.

## The four "paid total" sites that must subtract refunds

Refunds are only correct if every place that derives "paid" subtracts active
refunds. There are four, and missing any one shows an invoice as paid in one
surface and refunded in another:

1. `payments.repository.ts::sumActivePaymentCentsForJob` — job balance
   (`invoices.service.getJobInvoiceBalance`) **and** online-link amount-due
   (`online-payment-link.service`). Becomes
   `sum(non-void payments.amount) − sum(non-void refunds.amount)`.
2. `payments.repository.ts::listPostedChargeInvoiceBalances` `active_allocations`
   CTE — drives auto-allocation of new payments. Per-invoice allocated becomes
   `sum(payment allocations on non-void payments) − sum(refund allocations on
non-void refunds)`. Without this, a refunded invoice still looks paid and a
   later re-payment won't re-allocate to it.
3. `bookkeeping/open-balance-query.ts` `pd` CTE — the open-balance worklist.
4. `reporting/reporting.service.ts` `pd` CTE — AR/aging report + CSV.

The implementation adds a refunds round-trip repository test and an explicit
assertion in each of these read paths so a future change can't silently drop the
refund subtraction (this is the same class of gap the company-settings upsert
test closed).

## Flows

### Manual refund (install-side, slice 1)

`POST /jobs/:jobId/invoices/.../payments/:paymentId/refund` (exact route mirrors
the existing void route), `payments:refund` required:

1. Lock the payment row + the job's posted invoices (same lock order as
   `recordPayment`/`voidPayment` to avoid deadlocks).
2. Validate: payment exists, not void, refundable amount remaining
   (`amount − sum(active refunds) ≥ requested`). Reject over-refund.
3. Insert `payment_refunds` (`source: 'manual'`, no provider) + reverse
   allocations into `payment_refund_allocations`.
4. Job timeline entry: `paymentRefunded`, "Refund of $X recorded (method)."

### Online (Stripe) refund (relay + worker, slice 2)

1. Office requests a refund (full/partial) on a card payment → API → relay.
2. Relay calls Stripe `refunds.create` on the connected account with
   `refund_application_fee: true` (proportional) and the refund amount.
3. Stripe emits a refund event (`charge.refunded` / `refund.updated`) to the
   relay webhook; the relay records it as a relay payment event.
4. The install worker polls/acks the event (reusing the existing payment-events
   pipeline) and records the `payment_refunds` row (`source: 'bellfield_payments'`,
   `provider: 'stripe'`, `provider_refund_id`, proportional
   `application_fee_refunded`) + reverses allocations — idempotent on
   `provider_refund_id`.
5. Pending state between request and confirmation is tracked like online
   payment sessions (no half-real refund row); UX shows "refund requested."

The `esModuleInterop` relay tsconfig fix rides slice 2's relay PR so it goes
through the `quality` gate.

## Permissions

New `payments:refund` action (contract `PermissionAction`), granted by default to
**owner**, **admin**, and **bookkeeping** — the roles that already hold
`payments:create`/`payments:edit` (record + void). Provider-confirmed payments
are refundable only through this permission; they remain non-voidable.

## Non-goals (this slice)

- Surcharge, deposits, partial-payment links — separate slices in the same lane.
- Refunding an already-refunded amount beyond the original payment.
- Voiding/reversing a refund.
- Refund-specific customer email (the existing timeline + office surfaces cover
  it; a customer refund receipt can come later).

## Test plan

- Repository: full + partial manual refund round-trips; over-refund rejected;
  void payment cannot be refunded; allocation reversal main-first; the four
  paid-total sites each subtract active refunds (refund-then-balance,
  refund-then-reallocate).
- Service/controller: permission gate; not-found; conflict copy.
- Worker (slice 2): idempotent refund-event apply; proportional fee recorded.
