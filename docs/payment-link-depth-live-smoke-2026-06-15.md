# Payment Link Depth Live Stripe Smoke - 2026-06-15

Dated evidence for the amount-scoped invoice payment link and job-level deposit
link hardening slice.

> Status: **PASSED - executed 2026-06-15 Pacific / 2026-06-16 UTC.**
> Sandbox-only Stripe Checkout through the live testing relay; no production
> money moved.

## Scope

Proved in this smoke:

- local Docker Postgres with migrations current
- local API and worker dev processes against the live testing relay
- worker backup job disabled for the smoke
- fresh local job `2052`
- job-level deposit link created before the invoice payment
- posted main invoice for `$5.00`
- partial invoice payment link for `$2.00`
- active unpaid links plus a new invoice link exceeding current due returned
  `confirmationRequired` with code `activeLinksMayExceedDue`
- confirming the active-link overage created the extra unpaid `$2.50` link
- Stripe Sandbox Checkout displayed the expected BellField descriptions and
  amounts for the deposit and invoice links
- the customer-facing Checkout page showed the explicit deposit amount before
  payment
- two sandbox card payments completed and returned to the relay success page
- worker polled, applied, and acknowledged the payment events
- local API ledger and balance reflected both provider-confirmed payments

Still not claimed:

- production/live-money payment run
- sold-shaped installed-release proof
- real customer merchant onboarding
- source-invoice-first allocation for adjustment-specific links
- stored cards or receipt emails

## Environment

- Dev machine: Robert's Windows PC
- Date/time: 2026-06-15 evening Pacific / 2026-06-16 UTC
- Database: local Docker Postgres container `bellfield-postgres`
- API target: `http://127.0.0.1:3001`
- Relay target: `https://relay.bellfield.app`
- Stripe context: Bell Software LLC sandbox/test mode
- Relay credentials: loaded from local secret files; no token or secret material
  is recorded here
- Worker: local source dev process with `BELLFIELD_BACKUP_ENABLED=false` and
  `BELLFIELD_PAYMENT_EVENTS_INTERVAL_SECONDS=5`
- Logs:
  `C:\Users\rober\AppData\Local\Temp\bellfield-payment-link-smoke-20260615-201733`

Migration readback:

```text
Migrations are up to date. (68 already applied, none pending.)
```

Relay health readback:

```json
{ "status": "ok" }
```

## Procedure And Observed Result

The smoke created a fresh local job and links through the real API:

```json
{
  "jobId": "a762899d-fce0-420f-8f37-cd3fd1e259a8",
  "jobNumber": "2052",
  "invoiceId": "a6e5ac74-f104-42e6-ab6c-9fbdf127b70b",
  "depositSession": "pay_sess_27bc55b3d6883e1807d9",
  "invoiceSession": "pay_sess_20c59388465672b9f720",
  "confirmedOverageSession": "pay_sess_d05f58420efcba88d62e"
}
```

The active-link overage guard returned the expected office confirmation:

```json
{
  "state": "confirmationRequired",
  "code": "activeLinksMayExceedDue",
  "message": "This job already has $3.25 in active unpaid online payment links. Creating another $2.50 link could let the customer pay more than the $5.00 currently due. Any overpayment will be held as job credit."
}
```

The `$1.25` deposit Checkout displayed:

```text
BellField deposit for job 2052
$1.25
Sandbox
```

The `$2.00` invoice Checkout displayed:

```text
BellField invoice 2052
$2.00
Sandbox
```

Both test card payments returned to:

```text
https://relay.bellfield.app/payment-return/success
```

Final API ledger and balance readback:

```json
{
  "netBilled": 5,
  "paidTotal": 3.25,
  "refundedTotal": 0,
  "amountDue": 1.75
}
```

Local payment rows:

|  Amount | Source              | Provider | Source invoice | Allocated invoice |
| ------: | ------------------- | -------- | -------------- | ----------------- |
| `$1.25` | `bellfieldPayments` | `stripe` | none           | main invoice      |
| `$2.00` | `bellfieldPayments` | `stripe` | main invoice   | main invoice      |

Local online-payment sessions:

| Relay payment session           |  Amount | Source invoice | Status    |
| ------------------------------- | ------: | -------------- | --------- |
| `pay_sess_27bc55b3d6883e1807d9` | `$1.25` | none           | `paid`    |
| `pay_sess_20c59388465672b9f720` | `$2.00` | main invoice   | `paid`    |
| `pay_sess_d05f58420efcba88d62e` | `$2.50` | main invoice   | `created` |

Timeline readback:

```text
Deposit link created for $1.25.
Payment link created for $2.00.
Payment link created for $2.50.
Online payment of $1.25 confirmed.
Online payment of $2.00 confirmed.
```

## Notes

- The deposit link was created before the invoice link, but the customer paid it
  after the main invoice had posted. Current allocation is intentionally
  job-level/main-first, so that deposit payment allocated to the posted main
  invoice. Source-invoice-first allocation remains a separate pre-v1 accounting
  behavior slice.
- The confirmed `$2.50` overage link was intentionally left unpaid. It proves
  the office confirmation path without forcing an overpayment. It will expire
  normally.
- Stripe Checkout's optional Link save-info checkbox was turned off before both
  card submissions; no payment method was saved by this smoke.
