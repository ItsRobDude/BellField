# BellField Delivery Relay Plan

This document is the controlling plan for the BellField-hosted delivery relay:
the service that lets sold, self-hosted BellField installs send customer-facing
email without any provider credential ever existing on customer-owned hardware.

It records decisions made 2026-06-10. Where something is still open it says so
explicitly.

Primary references:

- [customer-comms-and-delivery.md](./customer-comms-and-delivery.md) — key
  custody rule and the communications lane this relay serves
- [deployment-model.md](./deployment-model.md) — self-hosted posture and the
  relay privacy carve-out
- [asset-protection-and-licensing.md](./asset-protection-and-licensing.md) —
  one-time-purchase model; licensing gates acquisition and updates, never
  continued operation

---

## 1. The Custody Rule (decided)

A sold server is the customer's hardware and must be assumed readable by the
customer. Therefore:

- provider API keys never ship to customer-owned servers — not shared keys and
  not per-install scoped keys
- the relay holds the only provider credentials
- the only delivery-related credential on a sold install is its **relay
  token**: a revocable online credential issued alongside the license but
  separate from the signed license file (the offline right-to-run proof never
  doubles as a network credential and never contains relay secrets). The relay
  token grants exactly "use the relay as this shop, within entitlement" and is
  revocable server-side in one step

Per-install provider keys were considered and rejected.

---

## 2. Business Model (decided in principle)

The software remains a one-time purchase. The relay is a paid,
**usage-based** service: shops pay per use, at a rate BellField sets as a
markup over its real costs (provider fees, infrastructure, support) — a
margin-bearing service, not a pass-through. This keeps the no-subscription
software promise intact: customers pay once for BellField and pay separately
for the delivery service they actually use.

Rules that follow:

- relay entitlement is separate from the software license; a lapsed or
  exhausted relay balance stops relay-backed features only — the software
  itself never refuses to run (consistent with the asset-protection posture)
- when relay entitlement is missing or exhausted, the office sees the standard
  generic copy ("Estimate email is not available..." / a clear sending-limit
  message); never billing plumbing or provider details
- unit rate (decided 2026-06-11): **$0.03 per send**, billed monthly from
  relay metering; manual invoicing during the pilot, and the pilot shop may be
  comped. Default per-shop quota is **1,000 sends/month** (a safety cap, not
  the bill), overridable per shop via the issuance CLI

---

## 3. Shop Identity and the Relay Token (decided)

- identity is **per shop**, with **one active server at a time**
- the relay enforces single-active: a second server presenting the same shop's
  relay token must not silently coexist; activation moves the credential (with
  a support path for legitimate migration/server-death cases)
- the relay token asserts shop identity and relay entitlement only; it carries
  no provider credentials and no account-level authority, and it is distinct
  from the signed license file — the offline license is never a network
  credential and never contains relay secrets
- revoking one shop's relay token affects no other shop and touches nothing on
  customer hardware

The license/identity primitive itself (issuance, storage, rotation, activation
flow) is owned by the licensing lane and must be designed before the relay is
implemented — the relay consumes it, it does not invent it. That design is now
pinned in [relay-token-design.md](./relay-token-design.md) (token format,
single-active binding with automatic rebind + flap detection, issuance CLI,
install-side config).

---

## 4. Sender Identity (decided)

The shop fronts every email. Homeowners are the shop's customers, not
BellField's — BellField branding does not appear in the From line on either
tier. Shop identity (display name, reply-to, templates) is shop-owned content.

Two tiers:

**Default — BellField domain, shop name.** Mail is sent from BellField-owned
document sender addresses with the shop's company name as the From display
name: estimates use `estimates@bellfield.app` and invoice/payment documents use
`billing@bellfield.app` (for example, `Acme HVAC <billing@bellfield.app>`).
Zero setup for the shop.

**Optional — shop's own domain (paid add-on).** A shop may send from its own
domain without any exposure of BellField's backend:

1. BellField registers a dedicated sending **subdomain** of the shop's domain
   (such as `send.shopdomain.com`) under BellField's provider account,
   relay-side. Subdomain-only is decided: the shop's root-domain mail setup is
   never touched, which keeps misconfigured-SPF support tickets off BellField's
   desk.
2. The shop publishes the DNS records (DKIM/SPF/return-path) at its DNS host.
   BellField support assists; the office app may display the records to publish
   but never provider keys or account controls.
3. The relay confirms verification and from then on sends that shop's mail from
   its own subdomain — still through the relay, still BellField's keys only.

This is the standard ESP multi-domain pattern; it improves reputation isolation
(a shop's domain carries its own DKIM reputation) and justifies its price by
its real setup/support cost.

Note: the no-internal-leakage copy rule governs UI wording, not cryptographic
reality. DNS records and raw email headers inherently reveal the delivery
provider, as they do for every ESP on earth. That is acceptable; UI copy still
never names providers.

---

## 5. Relay API Shape (v1)

Narrow by design. The relay is not a generic email API:

- authenticate: relay token → shop identity + entitlement
- `send estimate document`: rendered subject, body text, document type,
  recipient, and the PDF, bounded by the shared
  `estimateEmailMaxAttachmentBytes` contract constant; the relay composes the
  actual MIME message itself in the BellField shape — callers cannot construct
  arbitrary email or choose arbitrary From addresses
- `delivery status`: poll per outbound message; returns sent / delivered /
  bounced / complained / failed with sanitized summaries
- `entitlement status`: remaining quota, sending state, custom-domain state

The same host and auth also carry estimate acceptance links and payment-link
surfaces ([customer-comms-and-delivery.md](./customer-comms-and-delivery.md)
Phases 4–5). Invoice delivery reuses `POST /v1/messages/send` with
`documentType: "invoice"`; the old `/v1/messages/estimate` route remains as a
legacy compatibility alias for older estimate-only clients.

Payment-link v1 is deliberately narrow:

- relay admin links a shop to a Stripe connected account with
  `relay-admin set-payments-account --shop-id=<shop> --stripe-account-id=acct_...`
- install calls `POST /v1/payment-sessions` with the job ref, an optional
  invoice ref, and the install-validated amount in cents. Invoice links include
  the initiating invoice id; deposit links omit it and record as job credit. The
  **install does not supply the customer
  redirect URLs**: the relay mints `success`/`cancel` URLs from its own
  `publicBaseUrl`, so a misconfigured install can never point the
  post-checkout redirect at an internal or wrong host.
- the install's payment-link idempotency key is deterministic per
  `(job, source, amount, attempt)` — no random component. Invoice links use the
  initiating invoice id as the source; deposit links use a `deposit` source. The
  API reuses an active unpaid local link instead of calling the relay again. If a
  same-dollar online card payment already succeeded but BellField still shows
  that amount due, or if other active unpaid links could let the customer pay
  more than the current amount due, the office must confirm before the API
  creates the next attempt key.
- relay creates a Stripe Checkout Session as a direct charge on the connected
  account, **card-only in v1** (`payment_method_types: ['card']`; delayed
  methods like ACH fire `async_payment_succeeded`, which is not handled yet and
  would otherwise be silently dropped), and applies BellField's platform fee
  (default 100 basis points)
- Stripe webhooks terminate at `POST /webhooks/stripe`. The relay **reconciles
  every paid event against the stored session** (amount, currency, connected
  account) and refuses mismatches; a zero-amount paid session is a no-op, not a
  crash; duplicate events for either unique index no-op rather than 500 into a
  Stripe retry loop.
- install worker polls `GET /v1/payment-events` and acknowledges with
  `POST /v1/payment-events/:id/ack` only after local ledger persistence. The
  worker records the confirmed payment **in full** and surfaces any
  unallocated remainder as an overpayment timeline note — a confirmed payment
  is never dropped or refused, even if the balance moved after the link was
  created.

No card data, Stripe secret key, or shop processor credential is ever present on
the customer-owned install.

---

## 6. Install-Side Queue (decided)

When the relay is unreachable or returns a retryable failure, the install
queues instead of failing:

- the send intent row (already how sends begin) stays `queued`; the worker
  retries with backoff
- the office sees an honest "Queued — will send automatically" state, can
  cancel while queued, and gets a notice/timeline entry when the send
  eventually succeeds
- queued sends expire to `failed` after **24 hours** (decided) rather than
  surprising a customer days later
- the existing 60-second dedupe and immutable document snapshot semantics carry
  over unchanged; the snapshot is taken at queue time so later edits never
  change what eventually sends

---

## 7. Delivery Status and Webhooks (decided)

Provider webhooks terminate at the relay. Installs poll the relay. Customer
servers keep requiring zero inbound reachability.

This is also what finally populates `delivered` / `bounced` / `complained` on
`outbound_messages` — statuses that exist today but are never set, because a
self-hosted server cannot receive webhooks.

---

## 8. Abuse, Reputation, and Operations (v1 requirements, not v3)

- per-shop send quotas enforced relay-side
- per-shop bounce/complaint-rate monitoring with automatic throttle before
  shared-domain reputation is damaged
- relay-side suppression list (hard bounces, complaints) honored before send
- one-step revocation per shop
- relay logs operational metadata (shop, recipient, timestamps, provider
  result); message bodies and PDFs are transient pass-through, never storage

---

## 9. Acceptance Records (explicitly deferred)

When estimate acceptance links exist, the relay will hold the customer's
acceptance only transiently until the install polls it. A durable
BellField-side signed receipt (dispute evidence that survives a dead shop
server) was considered and **deferred**: for now, a shop's lost server is a
known, documented risk, consistent with customer-owned-data posture. Revisit
when acceptance links are designed.

---

## 10. Build Order

1. **License/identity primitive** (licensing lane) — per-shop token, one
   active server, activation/move/revoke. Prerequisite; designed first —
   done, see [relay-token-design.md](./relay-token-design.md).
2. **Relay v1** — BellField-domain sending only: auth, narrow send API, quotas,
   suppression, webhook termination, status polling. **Built 2026-06-11**
   (`apps/relay`); deployment to the pilot host is still ahead.
3. **Install integration** — swap the internal email adapter to a relay client
   (the adapter boundary in `EmailProviderService` is the seam; office
   workflows unchanged), plus queue-and-retry via the worker. **Built
   2026-06-11** (office UI for queued sends remains, execution plan 5.5).
4. **Custom-domain add-on** — domain registration/verification flow and
   per-shop sender identity.
5. **Acceptance links** (comms Phase 4) on the same host/auth.
6. **Payment links** (comms Phase 5) with the rule that BellField pages never
   touch card data or shop processor keys: the install requests
   processor-hosted Stripe Checkout sessions through the relay, and payment
   confirmation follows the same webhook-at-BellField / poll-from-install
   pattern. First slice shipped 2026-06-13.

Until step 3 ships, the direct provider adapter behind
`BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY` remains the interim implementation
for BellField-operated installs only and must not ship to sold installs.

Execution detail for this build order — slices, mechanics, acceptance
criteria, and its place in the wider sellability sequence — lives in
[sellable-product-execution-plan.md](./sellable-product-execution-plan.md)
(Phases 0, 3, and 5).

---

## 11. Open Items

Resolved 2026-06-10: pricing model (usage-based with markup, §2), queue expiry
(24 hours, §6), custom domains (subdomain-only, §4), and sender branding (shop
fronts the email on both tiers, §4).

Resolved 2026-06-11: hosting — the pilot relay runs on owner-operated home
hardware as Docker containers (relay + Postgres + cloudflared) behind a
Cloudflare Tunnel: outbound-only connectivity, no inbound router ports, home
IP hidden. Operating rules: relay containers are single-purpose and
image-pinned, the relay database gets a nightly off-box `pg_dump` (it is the
billing ledger), and an external uptime monitor alerts on the health endpoint.
A dedicated host or VPS is required before Phase 6 ships — acceptance and
payment links make relay downtime visible to shops' own customers.

**Testing relay deployed 2026-06-12**: live at
`https://relay.bellfield.app` on the dual-purpose laptop's Ubuntu disk (the
planned host changed from the Unraid box to the dedicated machine). This is a
testing/pilot relay, not the permanent relay route. Evidence and open
operational items:
[relay-deployment-2026-06-12.md](./relay-deployment-2026-06-12.md). Operator
steps live in [testing-relay-ops.md](./testing-relay-ops.md); release artifact
publication lives in [release-operator-route.md](./release-operator-route.md).

Resolved 2026-06-11 (owner decisions, second round): unit pricing — $0.03 per
send billed monthly from relay metering, default quota 1,000 sends/month per
shop (§2); the office-facing entitlement and failure copy set — approved as
implemented in the install adapter and delivery summary messages (needs-setup,
temporarily-unavailable, quota-exhausted, suspended, recipient-unavailable,
sending-limit, expired, already-queued, and the 5.5 "Queued — will send
automatically" notice); and, in the licensing lane, a **1-year default update
window** for new licenses.

Still open:

- pilot uptime target (informal until Phase 6 forces a real one)
