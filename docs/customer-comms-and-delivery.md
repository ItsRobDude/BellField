# Customer Communications and Document Delivery

This document defines the next owner-first growth lane for BellField: customer
document delivery and operational follow-through.

It exists so customer-facing email, SMS, estimate acceptance, and payment links
grow from BellField's operational record instead of becoming a spammy marketing
module.

Primary references:

- [product-rules.md](./product-rules.md) - audience priority and operational growth posture
- [deployment-model.md](./deployment-model.md) - optional provider adapters and self-hosted constraints
- [workflows-and-state-machines.md](./workflows-and-state-machines.md) - estimate, invoice, and payment lifecycle rules
- [permissions-model.md](./permissions-model.md) - permission-aware access to estimates, invoices, payments, and settings

---

## 1. Product Rule

Every customer-facing message in this lane must be:

- triggered by a person
- permission-aware
- tied to a real operational record
- logged to the job timeline or another durable audit surface
- provider-backed but provider-replaceable

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
- Payments are recorded against posted invoices as an append-only ledger.
- Jobs already have a mixed timeline that can show important estimate, invoice,
  payment, media, register, and appointment events.
- `companySettings` already exists as a permission area, but a proper settings
  screen is still future work.

This document does not mean outbound delivery is implemented yet.
It defines the shape for the next implementation slices.

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

## 4. Provider Posture

Email, SMS, and payment services are optional adapters.

Default posture:

- the customer owns the provider account
- the customer controls API keys and billing
- provider keys stay in customer-controlled deployment/settings storage
- BellField stores operational results, not provider secrets
- provider pricing and terms are rechecked at implementation time

Recommended adapter sequence:

1. `EmailProvider`
2. `PaymentProvider`
3. `SmsProvider`

Resend is the recommended first email provider because it is a simple
transactional-email fit for estimate and invoice delivery. It must still sit
behind an adapter so BellField can later support SMTP, Postmark, SES, or another
provider without rewriting product workflows.

---

## 5. Settings Direction

BellField needs a proper settings screen for this lane.

Environment variables are acceptable only as a bootstrap or server-admin fallback
while the settings surface is being built. They are not the long-term customer
experience for provider configuration.

The settings screen should eventually include:

- company name
- customer-facing sender name
- sending email address
- reply-to email address
- email provider selection
- Resend API key and verified-domain status
- default document branding basics
- payment-provider settings
- SMS-provider settings
- provider test-send tools

Secrets must not be shown back to ordinary users after save. High-permission
users may replace or revoke them.

---

## 6. Document Delivery Target

Customer-facing estimates and invoices should feel like professional PDF
documents.

Preferred delivery behavior:

1. BellField generates or retrieves the customer document.
2. The office user chooses a recipient and clicks send.
3. BellField sends an email with a secure PDF link as the reliable default.
4. BellField may also attach the PDF when the provider and document size allow it.
5. The send action, actor, recipient, provider result, and failure state are
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
belong in a dedicated outbound-message event table or diagnostics surface, not
as raw customer-facing timeline noise.

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
- provider key
- provider message id
- status
- recipient email or phone
- sender display name
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

### Phase 1 - Communications Foundation

- add provider adapter boundary
- add per-install settings direction
- add outbound message persistence
- add job timeline entries for send/failure results
- support email first

### Phase 2 - Estimate Email Delivery

- office sends or resends an estimate
- BellField delivers a professional PDF or secure PDF link
- recipient, actor, timestamp, provider reference, and failure state are recorded
- no customer acceptance action yet unless explicitly included in a later slice

### Phase 3 - Invoice Email Delivery

- office or bookkeeping sends posted invoice documents
- delivery state is logged
- behavior respects invoice posting and correction rules

### Phase 4 - Estimate Acceptance Link

- customer approves or declines through a secure link
- captured name/signature, timestamp, selected option, and immutable estimate
  meaning are preserved
- office still controls scheduling and conversion

### Phase 5 - Payment Links

- payment links are allowed only for posted invoices
- payments are recorded from confirmed gateway state
- BellField stores provider reference and operational result
- payments remain online-only in v1

### Phase 6 - SMS Reminders and On-My-Way

- optional SMS adapter
- customer opt-in and opt-out behavior
- provider cost visibility
- rate controls
- person-triggered reminders and on-my-way messages before automation

---

## 11. First Implementation Slice

The first code slice should be estimate email delivery.

Acceptance criteria:

- office user with the right estimate permission can send an estimate
- sender and recipient come from settings/contact context, not hardcoded source
  constants
- provider call goes through `EmailProvider`
- document delivery uses a PDF or secure PDF link
- send attempt is persisted
- success/failure is visible to the office
- job timeline records the send result
- Resend-specific behavior is isolated to a provider implementation
- no automatic scheduling, invoice posting, payment charging, or campaign behavior

Do not add SMS, payment links, or customer acceptance to the first slice unless
the implementation is intentionally re-scoped.

---

## 12. Open Decisions Before Coding

- exact storage location for provider settings and encrypted secrets
- whether first PDF delivery uses generated PDF attachments, secure PDF links, or
  link-first plus attachment when safe
- exact permission name for sending customer-facing estimate and invoice
  documents
- whether a minimal settings screen must land before the first send action or in
  the same slice
- document branding fields required for the first pilot
- provider webhook handling order for delivery status

The default answer should stay conservative: build the adapter and audit trail
first, then widen only when the operational loop needs it.
