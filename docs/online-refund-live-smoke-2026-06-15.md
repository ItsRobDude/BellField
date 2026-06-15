# Online Refund Live Stripe Smoke — 2026-06-15

Runbook + dated evidence slot for the online (Stripe-via-relay) refund money path
end to end, closing the online-refunds PR2 slice. The backend (relay refund
endpoint + API pending model + worker apply/dead-letter) and the office UI ship on
unit tests; this is the live proof against the Stripe sandbox.

Reuses the Bell Software LLC Stripe sandbox + connected account already configured
for the 2026-06-14 payment-link smoke (`phase-6b-live-invoice-email-payment-smoke-2026-06-14.md`).

> Status: **PENDING — to execute.** Fill in the Result section on the live run.
> The actual run is manual (real Stripe Checkout + test card entry); it cannot be
> driven from CI.

## Scope to prove

- local API + worker against local Docker Postgres, using the live relay
- a posted-invoice card payment confirmed through the existing payment-link flow
  (the thing being refunded)
- office **Refund** on the online card payment → `POST /operations/payments/:id/online-refund`
- relay creates the Stripe refund on the connected account with
  `refund_application_fee: true`
- a **partial** refund first, then a **full** refund of the remainder
- Stripe `refund.*` webhook → relay refund event → worker applies it idempotently
- `payment_refunds` rows recorded with `source = bellfield_payments`, `provider = stripe`,
  `provider_refund_id`, and the **proportional `application_fee_refunded`**
- allocations reversed; the job's amount due rises by the refunded amount
- the office pending row (`requested — pending confirmation`) transitions to a
  confirmed refund line after the worker applies (the poll picks it up)
- the `payments:refund` permission gates the action

## Prerequisites

- `docker compose up -d` (Postgres `bellfield-postgres`); API migrations applied
  through `20260615_002`.
- API env: `BELLFIELD_RELAY_BASE_URL`, `BELLFIELD_RELAY_TOKEN`,
  `BELLFIELD_RELAY_SERVER_INSTANCE_ID` set to the live relay triplet.
- Worker running with the same relay triplet (refund-events poll reuses the
  payment-event interval).
- Relay Stripe webhook endpoint subscribed to `charge.refund.updated` /
  `refund.created` / `refund.updated` / `refund.failed`, on the pinned
  dashboard event version that tracks `STRIPE_API_VERSION` (`2026-05-27.dahlia`).

## Procedure

1. Create + post a main invoice on a test job; create a payment link; pay it with
   a Stripe test card. Confirm the worker recorded the online card payment
   (`source = bellfield_payments`) and the office shows it as "Online card".
2. In the Invoice tab, click **Refund** on the online card payment. Enter a
   **partial** amount (e.g. half), confirm "Request online refund".
   - Expect the row to show `Online refund of $X requested — pending confirmation`
     and the Refund button to disappear while it is pending.
3. Watch the worker log for the refund event poll/apply; within the office poll
   interval the pending row should become a confirmed `↳ $X refunded` line and the
   amount due should rise by the refunded amount.
4. Verify in Postgres: a `payment_refunds` row with `source='bellfield_payments'`,
   `provider='stripe'`, a non-null `provider_refund_id`, and a proportional
   `application_fee_refunded`; the `online_refund_requests` row at `status='succeeded'`.
5. Refund the **remaining** balance the same way (full remainder). Confirm a
   second `payment_refunds` row and that the payment is now fully refunded (no
   further Refund offered; amount due reflects the full reversal).
6. Cross-check Stripe: two refunds on the PaymentIntent totalling the payment, each
   with the application fee refunded proportionally.

## Expected vs. observed

| Check                                            | Expected                           | Observed |
| ------------------------------------------------ | ---------------------------------- | -------- |
| Office Refund action on online card payment      | present (gated `payments:refund`)  |          |
| Pending state after request                      | `requested — pending confirmation` |          |
| Worker applied refund event                      | `applied`, acked                   |          |
| `payment_refunds` partial row + proportional fee | present                            |          |
| Amount due rose by refunded amount               | yes                                |          |
| Full refund of remainder                         | second row, fully refunded         |          |
| Stripe shows both refunds + fee refunds          | yes                                |          |

## Result

_PENDING — record date/time, job number, amounts, refund ids, and any deviations
here on the live run._

## Still not claimed

- production/live-money refund (sandbox only)
- refund of a refund / reversal
- deposits, partial-payment links, stored cards, surcharge, customer refund receipt
