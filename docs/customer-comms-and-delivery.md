# Customer Communications and Document Delivery

This document defines the next owner-first growth lane for BellField: customer
document delivery and operational follow-through.

It exists so customer-facing email, SMS, estimate acceptance, and payment links
grow from BellField's operational record instead of becoming a spammy marketing
module.

Primary references:

- [product-rules.md](./product-rules.md) - audience priority and operational growth posture
- [deployment-model.md](./deployment-model.md) - BellField-operated delivery and self-hosted constraints
- [workflows-and-state-machines.md](./workflows-and-state-machines.md) - estimate, invoice, and payment lifecycle rules
- [permissions-model.md](./permissions-model.md) - permission-aware access to estimates, invoices, payments, and settings

---

## 1. Product Rule

Every customer-facing message in this lane must be:

- triggered by a person
- permission-aware
- tied to a real operational record
- logged to the job timeline or another durable audit surface
- delivered through BellField-controlled backend/provider infrastructure where
  BellField owns operational provider keys

BellField should not send surprise campaigns, automatic review spam, or broad
marketing blasts as part of this lane.

The through-line is:

```text
quote -> work -> invoice -> deliver -> pay -> retain
```

The first priority is making the business owner look professional and get paid.
Office staff are the daily operators of that loop. Field users should capture
recommendations, add-ons, photos, equipment context, and signatures cleanly
without turning the mobile app into the full office system.

---

## 2. Current Anchors

BellField already has enough operational structure to support this lane later:

- Estimates attach to jobs and can be approved, declined, converted, and exported
  as a printable document.
- Invoices belong to jobs, can be posted, and can be exported as a printable
  document.
- Payments are recorded as a job-level append-only ledger with allocations to
  posted charge invoices.
- Jobs already have a mixed timeline that can show important estimate, invoice,
  payment, media, register, and appointment events.
- `companySettings` exists as a permission area with an office settings surface
  for company name, reply-to, and estimate email template defaults.

Estimate PDF email delivery has shipped and rides the production relay with
queue/retry/cancel semantics (status stamps in §10). Estimate acceptance links
have also shipped: the relay hosts the public decision page and the worker
polls decisions back into the self-hosted install. The first payment-link slice
has shipped too: the office can create a full-balance Stripe Checkout link for a
posted invoice, the relay receives Stripe webhooks, and the worker records
confirmed payments locally. This document continues to define the guardrails for
the next delivery slices.

---

## 3. Non-Goals

Do not build these in the first delivery lane:

- customer portal
- customer self-booking
- marketing campaigns
- automatic review requests
- recurring drip messages
- BellField-hosted customer-data services
- payment collection before invoice/payment rules are respected

These may become later optional modules, but they should not set the identity of
the first communications foundation.

---

## 4. Delivery Ownership

Estimate email delivery is BellField-operated.

Default posture for estimate and invoice email:

- office users can send/resend operational documents
- estimate email sends from `estimates@bellfield.app`; invoice/payment-document
  email sends from `billing@bellfield.app`
- the provider account, provider API key, sending domain, and delivery backend
  are BellField-controlled infrastructure
- shops never enter email-provider API keys or choose an email provider
- shops may configure customer-facing content such as company name, reply-to,
  subject template, and body template
- BellField stores operational results such as send status, provider reference,
  document snapshot, recipient, actor, and failure summary

User-facing APIs, when added later, are for automating shop workflows. They must
not expose controls for backend infrastructure, delivery providers, provider
keys, signing secrets, storage credentials, or other operational plumbing.

The backend may still keep an internal email-provider adapter so BellField can
change implementation details without rewriting estimate workflows. That adapter
boundary is internal product infrastructure, not a customer configuration
surface.

### Key custody: the BellField delivery relay

Decided 2026-06-10. Provider API keys are BellField infrastructure secrets and
must never be distributed to customer-owned servers — not as a shared key and
not as per-install scoped keys. A self-hosted server is extractable by
definition, so no form of provider credential may live on sold installs.

The only sanctioned end-state is a BellField-hosted delivery relay:

- a customer install authenticates to the relay with its relay token — a
  revocable credential issued alongside the license; the signed license file
  itself stays offline and holds no secrets
- the install submits the rendered subject, body, and document; the relay holds
  the only provider key, performs the send, and returns the same sanitized
  result shape the internal adapter already exposes
- the relay enforces per-install send quotas and the suppression list, making
  per-send cost and abuse control real rather than honor-system
- provider webhooks (delivered, bounced, complained) terminate at the relay;
  installs poll the relay for delivery state, preserving the rule that customer
  servers need no inbound reachability
- revoking one install's token cuts off abuse without touching other installs
  or rotating anything on customer hardware
- the relay is the same BellField-hosted public surface that estimate
  acceptance links and payment links require later; build them on the same
  host, auth, and audit posture

Privacy carve-out, stated plainly because the self-hosted posture promises "no
BellField-hosted customer data": sent documents transit the relay transiently.
This is exactly the content the delivery provider already receives today; the
relay must not become storage of customer business data, and the deployment
docs must say so wherever the self-hosted posture is described.

**Status 2026-06-13: the relay exists and is deployed to production**
(`relay.bellfield.app`; see `relay-deployment-2026-06-12.md`). Installs send
through the relay-client adapter using a per-shop relay token; the first real
end-to-end delivered email is on record. The same relay now also hosts Phase 6a
estimate acceptance links; a live smoke on 2026-06-13 proved relay link
minting, public approve/decline pages, worker poll/ack, and local estimate
state application. The direct provider adapter remains in the codebase only as
the internal adapter boundary behind the relay — provider keys live solely on
the relay host and must never ship to sold installs.

The controlling design for the relay itself — business model, relay-token
semantics, sender identity tiers, API shape, queueing, and build order — is
[delivery-relay-plan.md](./delivery-relay-plan.md).

---

## 5. Settings Direction

BellField needs a proper settings screen for customer-facing content, not for
provider configuration.

The settings screen should eventually include:

- company name
- reply-to email address
- default document branding basics
- estimate email subject/body template defaults
- invoice email subject/body template defaults
- later document branding basics such as logo and footer text

The settings screen must not ask for email-provider API keys, delivery-provider
selection, verified-domain setup, backend secrets, or infrastructure credentials.

---

## 6. Document Delivery Target

Customer-facing estimates and invoices should feel like professional PDF
documents.

Preferred delivery behavior:

1. BellField generates or retrieves the customer document.
2. The office user chooses a recipient and clicks send.
3. BellField sends from the relay-owned document sender address
   (`estimates@bellfield.app` for estimates, `billing@bellfield.app` for
   invoices/payment documents).
4. First implementation may attach the generated PDF; later implementations may
   move to a secure PDF link as the reliable default.
5. The send action, actor, recipient, delivery result, and failure state are
   logged.

Reasoning:

- customers expect estimate and invoice documents to feel like PDFs
- secure links support resend, expiry, acceptance, payment, and audit behavior
- attachments alone are brittle because of size and deliverability limits
- link-first still lets the customer experience feel like "we emailed the PDF"

The existing printable HTML exports can feed this lane, but the target is a
server-side PDF document or secure PDF view/download path before broad delivery
is treated as complete.

---

## 7. Timeline and Audit Rules

Customer delivery events should appear in job history in readable language.

Examples:

- estimate sent to `customer@example.com` by Olivia Owner
- estimate delivery failed and needs review
- invoice sent to billing contact by Book Keeping
- payment link created for posted invoice
- customer approved estimate through secure link

The timeline should record the operational meaning. Provider-specific payloads
belong in a dedicated outbound-message event table, support export, or
diagnostics surface, not as raw customer-facing timeline noise.

---

## 8. Future Data Model Shape

When this lane moves from design to implementation, prefer a small
communications module instead of bolting provider calls directly into estimates
or invoices.

Likely records:

- `outbound_messages`
- `outbound_message_events`
- `customer_document_links`
- `communication_settings`

Likely `outbound_messages` fields:

- id
- job id
- document type
- document record id
- channel
- delivery provider key (internal; not customer configured)
- provider message id
- status
- recipient email or phone
- actor employee id
- created timestamp
- sent timestamp
- last error summary

Provider event rows can store webhook delivery state such as sent, delivered,
bounced, failed, opened, clicked, or suppressed where the provider supplies it.
The product should not depend on every provider supporting every event.

---

## 9. Secure Links

Estimate acceptance, invoice payment links, and PDF download links should use
short, unguessable tokens with explicit expiry and scope.

Secure-link rules:

- token grants only the minimum customer-facing action
- token does not expose the office app
- token should not require the customer to create a portal account in v1
- acceptance and payment actions must write durable audit rows
- payment completion must come from confirmed provider/webhook state, not only
  optimistic UI return state

Customer links should support future revocation and resend.

---

## 10. Phase Order

### Phase 1 - Communications Foundation — SHIPPED

- add BellField-operated email adapter boundary
- add customer-facing content settings
- add outbound message persistence
- add job timeline entries for send/failure results
- support email first

### Phase 2 - Estimate Email Delivery — SHIPPED

- office sends or resends an estimate
- BellField delivers a professional PDF or secure PDF link
- recipient, actor, timestamp, provider reference, and failure state are recorded
- no customer acceptance action yet unless explicitly included in a later slice

Shipped beyond the original scope: relay-backed delivery with queue/retry on
retryable failure, office Cancel for queued sends, and worker
retry/expiry/status-poll jobs.

### Phase 3 - Invoice Email Delivery — FIRST SLICE SHIPPED

- office or bookkeeping sends posted invoice documents
- delivery state is logged
- behavior respects invoice posting and correction rules
- invoice PDFs render from the posted invoice context, so later CRM edits do
  not rewrite what was sent
- the recipient email is chosen at send time and may default from the
  customer's current email address
- invoice sends reuse the relay document-send route (`POST /v1/messages/send`)
  with `documentType: "invoice"`; `/v1/messages/estimate` remains a legacy
  compatibility alias for older estimate-only clients
- invoice/payment-document email sends from `billing@bellfield.app`
- office settings include invoice email subject/body template defaults, with
  per-send overrides still available from the invoice send preview
- when the owner enables the `includeInvoicePaymentLink` setting, sending a
  posted **main** invoice with an outstanding balance appends an online pay-now
  link (the existing full-balance link) to the email body. The link is minted
  only after the send is reserved and the PDF renders, and the invoice send is
  never blocked if the link cannot be created (no balance, payments not
  configured, same-amount confirmation, etc.). Credits/adjustments/zero-balance
  invoices never get a link. Default off.

### Phase 4 - Estimate Acceptance Link — SHIPPED

The controlling design is [acceptance-links-design.md](./acceptance-links-design.md)
(slices 6a.1–6a.3 in `sellable-product-execution-plan.md`).

- customer approves or declines through a secure link
- timestamp, selected option, structured decline reasons, optional note, and
  immutable estimate version are preserved
- office still controls scheduling and conversion

### Phase 5 - Payment Links — FIRST SLICE SHIPPED

- payment links are allowed only for posted invoices
- payments are recorded from confirmed gateway state
- BellField stores provider reference and operational result
- payments remain online-only in v1

Shipped 2026-06-13: full-balance Stripe Checkout links through the BellField
relay, Stripe webhook intake on the relay, install worker poll/ack for confirmed
payment events, and local append-only job-level payment records with
auto-allocation across posted charge invoices. Payment-link idempotency is now
per `(job, amount, attempt)`: active unpaid links are reused locally, and a
same-dollar repeat after a prior online card payment requires office
confirmation before BellField creates the next Stripe Checkout attempt. Manual
full/partial refunds for manually recorded payments have also shipped on the
office invoice tab; they are append-only, permission-gated, and raise amount due
through refund allocations.

The provider-confirmed online refund path through Stripe/relay now exists end to
end: the backend (pending API request, relay refund, worker-confirmed ledger
apply and dead-letter) plus the office Refund-on-card action and pending/failed
display. The dated live Stripe sandbox smoke passed on 2026-06-15 Pacific /
2026-06-16 UTC. Still deferred: deposits, partial payments, stored cards,
customer surcharge logic, customer refund receipts, and processor-fee
reconciliation beyond BellField's application fee.

### Phase 6 - Operational Comms and SMS — NOT STARTED (email-first, decided 2026-06-12)

Booking confirmation, job reminder, and on-my-way messages ship email-first on
the existing relay — logged, person-triggered, per-job suppressible. SMS is
deferred as a separate provider decision.

- optional SMS adapter
- customer opt-in and opt-out behavior
- provider cost visibility
- rate controls
- person-triggered reminders and on-my-way messages before automation

---

## 11. First Implementation Slice — COMPLETE

The first code slice was estimate email delivery; every acceptance criterion
below is met (permission gate is `estimates:send`).

Acceptance criteria:

- office user with the right estimate permission can send an estimate
- sender address is fixed as `estimates@bellfield.app`
- recipient comes from contact context or explicit office input
- provider call goes through an internal BellField email-delivery adapter
- document delivery uses a PDF or secure PDF link
- send attempt is persisted
- success/failure is visible to the office
- job timeline records the send result
- provider-specific behavior is isolated from office settings and user workflow
- no automatic scheduling, invoice posting, payment charging, or campaign behavior

Do not add SMS, payment links, or customer acceptance to the first slice unless
the implementation is intentionally re-scoped.

---

## 12. Open Decisions Before Coding

- ~~whether first PDF delivery uses generated PDF attachments, secure PDF links,
  or link-first plus attachment when safe~~ — resolved: v1 sends a generated PDF
  attachment; secure links arrive with acceptance links (Phase 4)
- ~~exact permission name for sending customer-facing estimate and invoice
  documents~~ — resolved: `estimates:send` for estimates and `invoices:send`
  for posted invoices
- ~~whether a minimal settings screen must land before the first send action or
  in the same slice~~ — resolved: the company Settings surface shipped alongside
  delivery
- document branding fields required for the first pilot (still open)
- ~~provider webhook handling order for delivery status~~ — resolved 2026-06-10:
  webhooks terminate at the BellField delivery relay (see §4); installs poll the
  relay for delivery state

The default answer should stay conservative: build the adapter and audit trail
first, then widen only when the operational loop needs it.
