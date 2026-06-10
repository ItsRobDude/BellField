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
- the only delivery-related credential on a sold install is its license token,
  which grants exactly "use the relay as this shop, within entitlement" and is
  revocable server-side in one step

Per-install provider keys were considered and rejected.

---

## 2. Business Model (decided in principle)

The software remains a one-time purchase. The relay is a paid service, priced
to cover what each send actually costs BellField (provider fees, infrastructure,
support). This keeps the no-subscription-software promise intact: customers pay
once for BellField and pay separately, transparently, for the operating cost of
BellField-operated delivery.

Rules that follow:

- relay entitlement is separate from the software license; a lapsed relay
  subscription stops relay-backed features only — the software itself never
  refuses to run (consistent with the asset-protection posture)
- when relay entitlement is missing or exhausted, the office sees the standard
  generic copy ("Estimate email is not available..." / a clear sending-limit
  message); never billing plumbing or provider details
- exact pricing tiers and included-send quotas: **open**, business decision

---

## 3. Shop Identity and the License Token (decided)

- identity is **per shop**, with **one active server at a time**
- the relay enforces single-active: a second server presenting the same shop
  license must not silently coexist; activation moves the license (with a
  support path for legitimate migration/server-death cases)
- the token asserts shop identity and relay entitlement only; it carries no
  provider credentials and no account-level authority
- revoking one shop's token affects no other shop and touches nothing on
  customer hardware

The license/identity primitive itself (issuance, storage, rotation, activation
flow) is owned by the licensing lane and must be designed before the relay is
implemented — the relay consumes it, it does not invent it.

---

## 4. Sender Identity (decided, with one open detail)

Two tiers:

**Default — BellField-branded.** Mail is sent from `estimates@bellfield.app`
and visibly sent by BellField. Zero setup for the shop. Shop identity appears
in content, reply-to, and templates as today.

**Optional — shop's own domain (paid add-on).** A shop may send from its own
domain without any exposure of BellField's backend:

1. BellField registers the shop's sending domain (or a dedicated subdomain such
   as `send.shopdomain.com`) under BellField's provider account, relay-side.
2. The shop publishes the DNS records (DKIM/SPF/return-path) at its DNS host.
   BellField support assists; the office app may display the records to publish
   but never provider keys or account controls.
3. The relay confirms verification and from then on sends that shop's mail from
   its own domain — still through the relay, still BellField's keys only.

This is the standard ESP multi-domain pattern; it improves reputation isolation
(a shop's domain carries its own DKIM reputation) and justifies its price by
its real setup/support cost.

Notes:

- recommend subdomain-first (`send.` / `mail.`) so the shop's root-domain mail
  is never touched; allowing root domains is a support-cost decision: **open**
- the no-internal-leakage copy rule governs UI wording, not cryptographic
  reality: DNS records and raw email headers inherently reveal the delivery
  provider, as they do for every ESP on earth. That is acceptable; UI copy
  still never names providers.

---

## 5. Relay API Shape (v1)

Narrow by design. The relay is not a generic email API:

- authenticate: license token → shop identity + entitlement
- `send estimate document`: rendered subject, body text, recipient, and the
  PDF; the relay composes the actual MIME message itself in the BellField
  shape — callers cannot construct arbitrary email
- `delivery status`: poll per outbound message; returns sent / delivered /
  bounced / complained / failed with sanitized summaries
- `entitlement status`: remaining quota, sending state, custom-domain state

Later, the same host and auth carry estimate acceptance links and payment-link
surfaces ([customer-comms-and-delivery.md](./customer-comms-and-delivery.md)
Phases 4–5). Invoice delivery reuses `send` with a document type.

---

## 6. Install-Side Queue (decided)

When the relay is unreachable or returns a retryable failure, the install
queues instead of failing:

- the send intent row (already how sends begin) stays `queued`; the worker
  retries with backoff
- the office sees an honest "Queued — will send automatically" state, can
  cancel while queued, and gets a notice/timeline entry when the send
  eventually succeeds
- queued sends expire to `failed` after a bounded window rather than surprising
  a customer days later — recommended 24 hours: **open**
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
   active server, activation/move/revoke. Prerequisite; designed first.
2. **Relay v1** — BellField-domain sending only: auth, narrow send API, quotas,
   suppression, webhook termination, status polling.
3. **Install integration** — swap the internal email adapter to a relay client
   (the adapter boundary in `EmailProviderService` is the seam; office
   workflows unchanged), plus queue-and-retry via the worker.
4. **Custom-domain add-on** — domain registration/verification flow and
   per-shop sender identity.
5. **Acceptance links** (comms Phase 4) on the same host/auth, then payment
   links (Phase 5) with the rule that BellField pages never touch card data or
   shop processor keys: the shop's server creates processor-hosted checkout
   sessions outbound and payment confirmation follows the same
   webhook-at-BellField / poll-from-install pattern.

Until step 3 ships, the direct provider adapter behind
`BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY` remains the interim implementation
for BellField-operated installs only and must not ship to sold installs.

---

## 11. Open Items

- pricing tiers / included quota (business)
- queue expiry window (recommended 24h)
- custom domains: subdomain-only vs root allowed
- relay hosting choice and uptime target
- exact office-facing copy set for entitlement states (configured, ready,
  quota exhausted, suspended) — must follow the no-internal-leakage rule
