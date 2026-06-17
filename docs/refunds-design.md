# Refunds Design

Status: manual install-side refund slice shipped (2026-06-14); online
Stripe/relay refunds shipped end to end on 2026-06-15, including the relay
refund path, API pending model, worker apply/dead-letter, office Refund-on-card
action, pending/failed read model, retry/poll UX, and the dated live Stripe
sandbox smoke (`online-refund-live-smoke-2026-06-15.md`). Controlling doc for
the refunds slice of the money-path-depth lane. Decisions confirmed with Rob via
Q&A on 2026-06-14; online-refund build refinements on 2026-06-15.

## What this adds

A way to return money that was already received on a job — for both
provider-confirmed card payments (through Stripe, via the relay) and manually
recorded payments (cash/check returned). Refunds may be **full or partial**, are
**permission-gated**, and never rewrite a posted invoice — they are append-only
ledger entries, exactly like payments.

## Decisions (locked)

- **Scope of the full refunds lane:** online (Stripe) **and** manual refunds;
  full **or** partial amounts; gated behind a new `payments:refund` permission.
  The shipped implementation exposes manual full/partial refunds in the office
  and provider-confirmed online refunds through the relay/API/worker/office flow.
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

## The "paid total" sites that must subtract refunds

Refunds are only correct if every place that derives "paid" subtracts refunds.
There are six, in two repos, and missing any one shows an invoice as paid in one
surface and refunded in another:

1. `payments.repository.ts::sumActivePaymentCentsForJob` — job balance
   (`invoices.service.getJobInvoiceBalance`) **and** online-link amount-due
   (`online-payment-link.service`). Paired with `sumActiveRefundCentsForJob`;
   amount due = `netBilled − paid + refunded`.
2. `payments.repository.ts::listPostedChargeInvoiceBalances` `active_allocations`
   CTE — drives auto-allocation of new manual payments. Per-invoice allocated
   becomes `sum(payment allocations on non-void payments) − sum(refund
allocations)`. Without this, a refunded invoice still looks paid and a later
   re-payment won't re-allocate to it.
3. `payments.repository.ts::insertAutoAllocations` net-due cap — the
   `paid-before-this-payment` term must be **net of refunds**
   (`activePaidBefore − refundsForJob`), or a fully-refunded prior payment caps
   the new payment's allocation to 0 even though the invoice is unpaid again.
4. **Worker** `payment-events.repository.ts::listPostedChargeInvoiceBalances`
   `active_allocations` CTE — the provider-confirmed-payment allocation path has
   its own copy and needs the same `refunded_allocations` subtraction.
5. **Worker** `payment-events.repository.ts::insertAutoAllocations` net-due cap —
   same refund-net `paid-before` fix as (3).
6. `bookkeeping/open-balance-query.ts` and `reporting/reporting.service.ts` `pd`
   CTEs — the open-balance worklist and the AR/aging report + CSV.

Each is covered by a unit test or a real-DB SQL validation so a future change
can't silently drop the refund subtraction (the same class of gap the
company-settings upsert test closed).

## Voiding a refunded payment is blocked

`voidPayment` rejects any payment that already has `payment_refunds` rows:
voiding drops the payment from the paid total while its refund still counts,
inflating the balance. Correct a mistaken refunded payment with a compensating
payment instead. (Covered by a repository test.)

## Payment ledger export

The reporting payment-ledger CSV now emits refund rows too. `Entry type`
distinguishes `payment` from `refund`; `Entry ID` is the specific ledger row;
`Payment ID` links a refund back to its original receipt; and `Provider
transaction ID` carries the provider payment id for payments or the provider
refund id for refunds. The bookkeeping/accounting hand-off represents the full
money ledger the moment refunds are recordable.

## Flows

### Manual refund (install-side, slice 1) — SHIPPED

`POST /operations/payments/:paymentId/refund` (mirrors the existing void route),
`payments:refund` required:

1. Lock the payment row + the job's posted invoices (same lock order as
   `recordPayment`/`voidPayment` to avoid deadlocks).
2. Validate: payment exists, not void, refundable amount remaining
   (`amount − sum(active refunds) ≥ requested`). Reject over-refund.
3. Insert `payment_refunds` (`source: 'manual'`, no provider) + reverse
   allocations into `payment_refund_allocations`.
4. Job timeline entry: `paymentRefunded`, "Refund of $X recorded (method)."

### Online (Stripe) refund (relay + worker) — SHIPPED

Built around a real refund-event lifecycle (not a thin extension of the payment
pipeline — `relay_payment_events` is payment-only and can't hold refunds). The
implementation landed in two layers split at the cross-app contract boundary.

**Layer 1 — foundation + money path, no office button (proven in tests):**

- **Contracts** (`relay-delivery.ts`): `RelayCreateRefundRequest` /
  `RelayRefundResult` / `RelayRefundEventRecord` (status `succeeded|failed`); an
  API-side online-refund request with lifecycle `requested → succeeded | failed`.
- **Relay** dedicated tables `relay_payment_refund_requests` +
  `relay_payment_refund_events` (migration `20260614_107`). Token-authed endpoint
  takes a relay-owned **session reference** (the Stripe checkout session id), not
  a raw PaymentIntent/amount; the relay looks up the session, validates shop
  ownership + connected account + currency + **amount ≤ remaining refundable**
  (remaining = session paid − succeeded refunds − **outstanding requested/pending
  refund requests**, so a double-click or parallel request can't both pass relay
  validation), then `stripe.refunds.create({ payment_intent, amount?,
  refund_application_fee:
true }, { stripeAccount, idempotencyKey })`. **Pin the Stripe client
  `apiVersion`** and pin/document the **webhook endpoint version**; handle
  `refund.created/updated/failed`, storing events idempotently on
  `provider_refund_id` (succeeded) / recording failures; apply ledger changes
  only for **succeeded**. Refund-event poll + ack endpoints mirror payments. The
  relay **`esModuleInterop`** tsconfig cleanup is **deferred to its own tiny PR**
  (orthogonal to refunds, changes emit for every relay import, wants its own
  build check; `import Stripe = require()` already works).
- **Relay** refund-event lookup resolves the request by Stripe refund id first,
  then by the metadata request id only if no refund-id row exists, and returns
  `mismatch` when the two disagree — a single `OR` could match two rows and
  advance an arbitrary one.
- **API** dedicated **pending online-refund request table** (`online_refund_requests`,
  migration `20260615_001`) keyed to `payment_id`: amount, currency, reason,
  `requested_by_*`, `idempotency_key`, `relay_refund_request_id`,
  `provider_refund_id`, status, `last_error`, and worker dead-letter columns
  `apply_attempt_count`/`last_apply_error`/`last_apply_attempt_at`/`failed_at`.
  New **`POST /operations/payments/:paymentId/online-refund`** (request →
  pending); the existing `/refund` stays **manual-only**. The flow is split into
  three phases so **no DB lock is held across the relay network call**: (1) a
  short txn locks job+payment, validates (online, not void, has session id,
  amount ≤ remaining refundable net of confirmed refunds + outstanding requests)
  and creates-or-reuses the pending row; (2) the relay call runs outside any txn;
  (3) a short update records the outcome. A **retryable/transport** relay failure
  leaves the request `requested` with `last_error` and the **same idempotency
  key** (a retry never double-refunds); only a **terminal/non-retryable** failure
  moves it to `failed`. Response states: `requested | failed | providerError |
paymentsNotConfigured`. A `failed` request with `apply_attempt_count > 0` is
  not a clean processor rejection: it means Stripe accepted the refund but
  BellField dead-lettered local recording, so the API blocks additional refunds
  for that payment until support reconciles it.
- **Worker** `applyRelayRefundEvent`: write `payment_refunds`
  (`bellfield_payments`/`stripe`/`provider_refund_id`/proportional
  `application_fee_refunded`) + reverse allocations main-first, **idempotent on
  `provider_refund_id`**, **only after the local payment exists** (match
  `provider_payment_id`) — never fabricate from `jobRef`. Reconcile the pending
  request to `succeeded` by **`provider_refund_id` → `relay_refund_request_id` →
  outstanding `(payment, amount)`** (the last covers an API timeout before the ids
  were stored). **Deferred/dead-letter**: a succeeded refund whose payment isn't
  recorded yet **defers** (no ack, relay redelivers) and bumps
  `apply_attempt_count`; past an **injectable bound (default 30, ~30 min at the
  shared payment-event poll)** the request is marked `failed` + a
  `paymentRefundFailed` timeline entry and the event is acked. A `refund.failed`
  event marks the request failed (+ `paymentRefundFailed` timeline) **without**
  writing a refund row. The refund poll **reuses the payment-event interval**.

**Layer 2 — office UI + live smoke:** enable Refund on card (`bellfieldPayments`)
payments with a **confirm dialog** ("Request a $X online refund?"), a "refund
requested" pending state, duplicate-request blocking, and confirmed/failed
display; dated Stripe sandbox smoke (card payment → partial + full refund →
webhook → worker → ledger).

**The worker has no bounded retry today** (`payment-events-service.ts` just
skips the ack and redelivers forever) — the dead-letter handling above is new,
not "existing."

## Permissions

New `payments:refund` action (contract `PermissionAction`), granted by default to
**owner**, **admin**, and **bookkeeping** — the roles that already hold
`payments:create`/`payments:edit` (record + void). Provider-confirmed payments
are refundable only through this permission; they remain non-voidable.

## Non-goals (this slice)

- Stored cards and processor-fee reconciliation beyond BellField's application
  fee — separate slices in the same lane. Customer card surcharge /
  processing-fee pass-through is intentionally not planned for v1 unless real
  customer demand justifies a dedicated legal and card-network review.
- Refunding an already-refunded amount beyond the original payment.
- Voiding/reversing a refund.
- ~~Refund-specific customer email~~ **Shipped (slice 2a, manual refunds):** a
  recorded refund enqueues a `refundReceipt` in the same transaction and the
  worker send-loop emails it from the owner-editable refund template
  (`sendRefundReceipts` toggle). The refund copy omits a method token (a manual
  refund records no refund-method). **Online refund receipts shipped too (slice
  2b):** the worker enqueues a `refundReceipt` only when it records a
  provider-confirmed Stripe refund (`'applied'`) — never on the failed, deferred,
  dead-lettered, or already-applied paths.

## Test plan

- Repository: full + partial manual refund round-trips; over-refund rejected;
  void payment cannot be refunded; allocation reversal main-first; the four
  paid-total sites each subtract active refunds (refund-then-balance,
  refund-then-reallocate).
- Service/controller: permission gate; not-found; conflict copy.
- Office: manual Refund action only for eligible manual payments; no local
  refund/void action for provider-confirmed online payments; competing payment
  actions hide while a refund draft is open.
- Worker (slice 2): idempotent refund-event apply; proportional fee recorded.
