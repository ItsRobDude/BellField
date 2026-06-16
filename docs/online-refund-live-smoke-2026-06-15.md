# Online Refund Live Stripe Smoke — 2026-06-15

Runbook + dated evidence slot for the online (Stripe-via-relay) refund money path
end to end, closing the online-refunds PR2 slice. The backend (relay refund
endpoint + API pending model + worker apply/dead-letter) and the office UI ship on
unit tests; this is the live proof against the Stripe sandbox.

Reuses the Bell Software LLC Stripe sandbox + connected account already configured
for the 2026-06-14 payment-link smoke (`phase-6b-live-invoice-email-payment-smoke-2026-06-14.md`).

> Status: **PASSED — executed 2026-06-15 Pacific / 2026-06-16 UTC.**
> Sandbox-only Stripe Checkout and refund flow; no production money moved.

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
- Relay Stripe webhook endpoint subscribed to `refund.created` /
  `refund.updated` / `refund.failed`, on the pinned
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

| Check                                            | Expected                           | Observed                                                                               |
| ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Office Refund action on online card payment      | present (gated `payments:refund`)  | present before full refund; hidden after full refund                                   |
| Pending state after request                      | `requested - pending confirmation` | observed in API/read model; office poll flipped to confirmed refund after worker apply |
| Worker applied refund event                      | `applied`, acked                   | two events applied and acknowledged                                                    |
| `payment_refunds` partial row + proportional fee | present                            | `$60.00` refund with `$0.60` application-fee refund                                    |
| Amount due rose by refunded amount               | yes                                | `$60.00` after first refund; `$120.00` after full refund                               |
| Full refund of remainder                         | second row, fully refunded         | second `$60.00` refund; total refunded `$120.00`                                       |
| Stripe shows both refunds + fee refunds          | yes                                | two Stripe refunds on the PaymentIntent; application fee fully refunded proportionally |

## Result

Live run used local API/worker/office against the live relay and Bell Software LLC
Stripe sandbox.

- Job: `2051`
- Job id: `dc4fc379-da01-4270-9a5f-497c924ec046`
- Invoice id: `59cce811-e046-4506-8a2f-6cc28f4560d3`
- Payment id: `f4aebfc6-f3ca-4936-b863-c8cbf4f2b7e2`
- Relay payment session: `pay_sess_1353865970750535c6ab`
- Stripe PaymentIntent: `pi_3Tikh3ANpoMyEZNZ0Zx0zHwY`
- Payment amount: `$120.00`
- Application fee: `$1.20`

Refunds recorded locally:

| Local refund id                        | Stripe refund id              |   Amount | Application fee refunded |
| -------------------------------------- | ----------------------------- | -------: | -----------------------: |
| `a85a3887-b1d4-43fa-8c1b-5a823904725d` | `re_3Tikh3ANpoMyEZNZ0nlLz8OX` | `$60.00` |                  `$0.60` |
| `add5a8d9-89ca-4da3-ad24-1b5f71311c22` | `re_3Tikh3ANpoMyEZNZ0koRGSEY` | `$60.00` |                  `$0.60` |

Final local totals: `payment_refunds.amount = $120.00`,
`payment_refunds.application_fee_refunded = $1.20`. The office invoice tab showed
the posted `$120.00` invoice, paid `$120.00`, refunded `$120.00`, and amount due
`$120.00`.

Operational notes from the run:

- The first refund attempt failed before reaching Stripe because the live relay
  host was still on an older commit and returned `404 Cannot POST /v1/payment-refunds`.
  The relay host was backed up (`bellfield-relay-20260616T002411Z.dump`), pulled
  forward, rebuilt, and migrated through `20260614_107_relay_payment_refunds.up.sql`.
- The Stripe webhook endpoint initially only subscribed to
  `checkout.session.completed`; it was updated to include `refund.created`,
  `refund.updated`, and `refund.failed`.
- The first accepted refund occurred before the webhook subscription fix. The
  exact Stripe event (`evt_3Tikh3ANpoMyEZNZ0SRbE8ub`) was replayed once to the
  relay webhook with a valid Stripe signature so the worker could apply and ack it.
- The second refund proved the corrected webhook subscription without manual
  replay: Stripe webhook -> relay refund event -> worker apply -> ack.
- The smoke exposed one office-read-model polish issue: an old clean failed
  submission could still display after later confirmed refunds fully covered the
  payment. The PR now hides that stale, no-longer-actionable prompt while keeping
  true recording-failed dead letters visible.

## Still not claimed

- production/live-money refund (sandbox only)
- refund of a refund / reversal
- stored cards, surcharge, customer refund receipt
