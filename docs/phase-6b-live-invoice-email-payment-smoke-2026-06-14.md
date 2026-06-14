# Phase 6b Live Invoice Email and Payment-Link Smoke - 2026-06-14

This is dated evidence for the invoice email/payment-link follow-up against the
live testing relay. The run started as a blocked invoice smoke, then continued
after configuring the Bell Software LLC Stripe sandbox for relay payments.

## Scope

Proved in this smoke:

- local API and worker started against the local Docker Postgres database
- local API used the live relay at `https://relay.bellfield.app`
- estimate send still delivered through the relay after document-aware sender
  changes
- Gmail received the estimate from `estimates@bellfield.app`
- invoice send delivered from `billing@bellfield.app`
- invoice email included a Stripe Checkout pay-online link
- invoice email included the posted-invoice PDF attachment
- the PDF rendered from posted invoice context: job `2050`, Parker bill-to,
  Parker service location, work order, and `$147.25` total
- Stripe Checkout opened in sandbox mode for the expected invoice and amount
- test-mode card payment redirected to the relay success page
- Stripe webhook produced a relay payment event
- the local worker polled, applied, and acknowledged the payment event
- the local payment ledger recorded the provider-confirmed card payment and
  allocation

Still not claimed:

- sold-shaped installed-release proof
- real merchant onboarding for a production customer
- production/live-money payment run
- custom-domain sending
- refunds, deposits, stored cards, partial-payment logic, surcharge logic, SMS,
  reminders, or field-mobile send UI

## Environment

- Dev machine: Robert's Windows PC
- Date/time: 2026-06-14 afternoon Pacific
- Database: local Docker Postgres container `bellfield-postgres`
- API/worker: local source dev processes
- Relay target: `https://relay.bellfield.app`
- Gmail inbox checked: `itsrobdude@gmail.com`
- Stripe context: Bell Software LLC sandbox/test mode
- Relay credentials and Stripe secrets: loaded from local/host secret stores; no
  token or secret material is recorded in this evidence file
- Backup job: disabled for this smoke (`BELLFIELD_BACKUP_ENABLED=false`)
- API/worker logs:
  `C:\Users\rober\AppData\Local\Temp\bellfield-invoice-payment-smoke-20260614-155103`
- Invoice/payment evidence:
  `C:\Users\rober\AppData\Local\Temp\bellfield-invoice-payment-smoke-evidence-2026-06-14T22-54-56-762Z\invoice-payment-smoke.json`

The local DB was migrated first:

```powershell
pnpm dev:migrate
```

Readback:

```text
Migrations are up to date. (65 already applied, none pending.)
```

## Relay Payment Setup

The Bell Software LLC Stripe sandbox was configured for the live testing relay:

- sandbox platform account used in Dashboard: `acct_1Tb5VOANpoJE5mbE`
- connected sandbox merchant account: `acct_1TiMhjANpoMyEZNZ`
- Stripe webhook endpoint created for `https://relay.bellfield.app/webhooks/stripe`
- webhook event enabled: `checkout.session.completed`
- relay host env updated with Stripe secret key and webhook secret without
  printing secret values
- relay database backed up before redeploy:
  `/mnt/bellfield-backups/relay/bellfield-relay-20260614T224420Z.dump`
- BellField Dev relay shop `shop_0e252902e567` linked to the connected sandbox
  account with payments enabled

Enabling Stripe exposed a relay runtime bug in the Stripe client import. The
fix was committed as `9fc68801` (`Fix relay Stripe client runtime import`) and
deployed before continuing the smoke. Validation for that fix:

```powershell
pnpm --filter @bellfield/relay test
pnpm --filter @bellfield/relay typecheck
pnpm --filter @bellfield/relay build
```

Additional compiled-output smoke:

```text
configured=true
```

The push also ran the repo pre-push test suite successfully. After deploy, relay
health returned:

```json
{ "status": "ok" }
```

Relay shop inspect confirmed:

```json
{
  "shopId": "shop_0e252902e567",
  "paymentsStatus": "enabled",
  "stripeConnectedAccountId": "acct_1TiMhjANpoMyEZNZ"
}
```

## Estimate Result

Earlier in the same dated smoke, before Stripe was configured, the smoke script
created job `2048` and estimate `f5561d0d-5c08-4e84-a024-57814fb5d7fc`, then
sent the estimate to `itsrobdude@gmail.com`.

Send response summary:

```json
{
  "outboundMessageId": "f08ebcde-08f1-42b8-9ee5-c3e4230353af",
  "status": "sent",
  "acceptanceUrl": "https://relay.bellfield.app/a/e981e615b0b38b26aede339a896f7e16b813df5c",
  "pdfSnapshotId": "eda19cea-95f3-45fb-b542-f492393a18ed",
  "pdfByteSize": 2467
}
```

Gmail readback for subject
`BellField smoke estimate 2026-06-14T22-11-17-942Z`:

- From: `BellField <estimates@bellfield.app>`
- To: `itsrobdude@gmail.com`
- Reply-To: `billing@bellfield.app`
- Attachment:
  `estimate-Smoke-estimate-2026-06-14T22-11-17-942Z-f5561d0d-5c08-4e84-a024-57814fb5d7fc.pdf`
- Attachment MIME type: `application/pdf`
- Attachment size: `2467`
- SPF: pass
- DKIM: pass for `bellfield.app`
- DMARC: pass

## Invoice Email and Payment-Link Result

The completed invoice smoke created a fresh job and posted invoice:

```json
{
  "jobId": "4557e250-f09c-490e-9b86-d9d6eb4ea51d",
  "jobNumber": "2050",
  "invoiceId": "a3347926-d332-4c19-a2d3-351d7c50f74b",
  "invoiceStatus": "posted",
  "invoiceTotal": 147.25
}
```

The smoke temporarily enabled `includeInvoicePaymentLink`, set the reply-to to
`billing@bellfield.app`, sent the invoice, and then restored company settings.
API readback after restore confirmed:

```json
{
  "companyName": "BellField",
  "replyToEmail": null,
  "includeInvoicePaymentLink": false,
  "invoiceEmailSubject": "Invoice {jobNumber} from {companyName}"
}
```

Payment-link preflight returned a payable link:

```json
{
  "state": "created",
  "paymentSessionId": "pay_sess_6b561784179178d03e77",
  "amount": 147.25,
  "currency": "USD"
}
```

Invoice send response summary:

```json
{
  "outboundMessageId": "95beefac-f783-4c2d-a1c6-74f9b070ba0e",
  "status": "sent",
  "documentSnapshotId": "ee7d439b-1705-45af-9f48-564a96dbb673",
  "pdfByteSize": 2455,
  "paymentLinkIncluded": true,
  "recordingIncomplete": false
}
```

Gmail readback for subject
`BellField smoke invoice 2026-06-14T22-54-56-762Z`:

- From: `BellField <billing@bellfield.app>`
- To: `itsrobdude@gmail.com`
- Attachment:
  `invoice-2050-a3347926-d332-4c19-a2d3-351d7c50f74b.pdf`
- Attachment MIME type: `application/pdf`
- Attachment size: `2455`
- Body included:

```text
Hello Jordan and Casey Parker, this is a BellField invoice payment-link smoke for job 2050.

Pay online: https://checkout.stripe.com/c/pay/...
```

Parsed PDF text included:

```text
BellField
Reply to: billing@bellfield.app
Invoice a3347926-d332-4c19-a2d3-351d7c50f74b
Status: Posted
Job: 2050
Work order: invoice-payment-smoke-2026-06-14T22-54-56-762Z
Bill To
Jordan and Casey Parker
214 Cedar Avenue
Everett, WA, 98201
Service Location
Parker Residence
214 Cedar Avenue
Everett, WA, 98201
Total $147.25
```

## Stripe Checkout and Local Payment Result

Chrome opened the invoice payment link. The Checkout page showed:

- merchant label: `Test account`
- sandbox badge: `Sandbox`
- line item: `BellField invoice 2050`
- amount: `$147.25`
- contact email: `itsrobdude@gmail.com`

A standard Stripe test card completed the sandbox payment and redirected to:

```text
https://relay.bellfield.app/payment-return/success
```

The return page showed:

```text
Payment received
Thanks. The office will see the payment after processing finishes.
```

Worker log readback:

```json
{
  "message": "Payment event poll completed.",
  "context": {
    "fetched": 1,
    "applied": 1,
    "acknowledged": 1
  }
}
```

The local job payment ledger then returned:

```json
{
  "amount": 147.25,
  "method": "card",
  "source": "bellfieldPayments",
  "provider": "stripe",
  "currency": "USD",
  "recordedByName": "BellField Payments",
  "applicationFee": 1.47,
  "allocations": [
    {
      "invoiceId": "a3347926-d332-4c19-a2d3-351d7c50f74b",
      "invoiceKind": "main",
      "amount": 147.25
    }
  ],
  "isVoid": false
}
```

Final relay checks:

```json
{ "events": [] }
```

```json
{ "status": "ok" }
```

The relay, relay Postgres, and Cloudflare Tunnel containers remained running.

## Result

Invoice email delivery with a pay-online link is proven end to end in the
same-machine/live-relay sandbox path:

1. local posted invoice
2. relay-created Stripe Checkout Session
3. invoice email from `billing@bellfield.app`
4. PDF attachment and pay-online link received in Gmail
5. Stripe sandbox payment
6. relay webhook
7. worker poll/ack
8. local provider-confirmed payment ledger row

This closes the invoice-email/payment-link smoke blocker for the current
testing relay. The remaining gates are sold-shaped installed-release proof and
real merchant onboarding/production payment policy, not the local source path
or testing relay payment plumbing.
