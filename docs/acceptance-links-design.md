# Estimate Acceptance Links Design (Phase 6a)

This document opens Phase 6 of
[sellable-product-execution-plan.md](./sellable-product-execution-plan.md):
customer-facing estimate acceptance on the relay's host and auth, followed
later by payment links (sketched in §10, designed properly when 6a ships).

Competitive context: ServiceTitan, Housecall Pro, and Jobber all let the
homeowner approve an estimate from the email. BellField approval is currently
office-recorded ("Mark approved"). This phase closes that gap and finally
makes "Customer approved" a literal statement.

## Constraints already decided (binding)

- Acceptance pages live on the relay host and auth
  ([delivery-relay-plan.md](./delivery-relay-plan.md) §5, §10 step 5).
- Acceptance records transit the relay only until the install polls them; a
  durable BellField-side dispute receipt is **deferred** — a dead shop server
  losing history is a known, accepted risk (relay plan §9).
- The shop fronts everything the homeowner sees; no BellField branding on
  the page (the URL being on `relay.bellfield.app` is accepted, exactly like
  the default-tier From address).
- No-internal-leakage copy rules apply to every customer-facing string.
- Message bodies and PDFs are never stored relay-side (relay plan §8) — this
  design works within that rule rather than weakening it.
- D7: shipping Phase 6 requires the relay hosting decision to be revisited,
  because acceptance-page downtime is homeowner-visible (§11 below).

## The flow

1. Office sends an estimate (existing flow). The install asks the relay to
   mint an acceptance link in the same call; the email body gains a
   "Review and approve" URL.
2. The homeowner opens `https://relay.bellfield.app/a/<token>`: a
   shop-fronted page showing the shop's name, the estimate title, the total
   (or the option choices), and Approve / Decline buttons. The PDF stays in
   their email — the page is a decision surface, not a document store.
3. The decision is recorded relay-side and the page confirms it ("Thanks —
   Acme HVAC has been notified.").
4. The install's worker polls the relay, applies the decision to the
   estimate (status, actor "Customer", timeline entry), and acknowledges.
   The office sees "Customer approved" without anyone touching BellField.

## Link anatomy and token

- URL: `https://relay.bellfield.app/a/<token>`; token is opaque —
  `randomBytes(20)` hex (40 chars), stored relay-side **as a SHA-256 hash**
  (same posture as relay tokens; a relay DB leak must not yield live links).
- Possession of the email is the authentication, as it is for every ESP
  acceptance flow. No homeowner accounts, ever.
- One link per outbound send. Resending an estimate mints a fresh link and
  revokes the prior one (the old email's link shows "This estimate was sent
  again — use the newest email.").
- Links expire (default **30 days**, configurable per shop later). Expired
  links render a neutral "ask the shop to resend" page.
- A used link becomes read-only: revisiting shows the recorded decision.

## Send-API extension (relay contract)

`POST /v1/messages/estimate` gains an optional `acceptance` payload:

```jsonc
{
  // ...existing send fields...
  "acceptance": {
    "estimateRef": "<install-side estimate id, opaque to the relay>",
    "estimateVersion": 4,
    "title": "AC replacement options",
    "options": [
      // single-option estimates send exactly one entry
      { "id": "opt-good", "label": "Good — repair", "totalCents": 84500 },
      { "id": "opt-best", "label": "Best — replace", "totalCents": 412000 }
    ],
    "expiresInDays": 30
  }
}
```

The response adds `acceptanceUrl`, which the install splices into the email
body via a `{acceptanceLink}` template token (and appends automatically when
the template lacks the token, so shops cannot accidentally send dead emails).

The relay stores only this small structured payload — never the PDF. Money
amounts are integer cents, display-only, shop-supplied.

Option groups matter: send-before-approval with options is the real sales
motion, and the homeowner picking Good/Better/Best **is** the approval. A
single-option estimate is the degenerate case of the same mechanism.

## Relay-side storage and endpoints

New tables (names indicative):

- `acceptance_links` — id, shop id, token hash, relay_message id, estimate
  ref + version, title, options JSON, status
  (`open | approved | declined | expired | superseded`), decision fields
  (option id, homeowner note ≤500 chars, decided_at, requester IP for abuse
  forensics), expires_at, created_at.
- Decisions are delivered to the install at-least-once:
  `GET /v1/acceptance-decisions` returns undelivered decisions for the shop;
  `POST /v1/acceptance-decisions/:id/ack` marks delivery. Rows are retained
  after ack (they are tiny and they are billing-adjacent evidence), which
  softens — without reversing — the deferred-durable-receipt decision.

Public (unauthenticated) surface, aggressively narrow:

- `GET /a/:token` — the decision page (server-rendered HTML from the relay,
  no client framework; shop name + title + options + two buttons).
- `POST /a/:token/decision` — `{ decision: approve|decline, optionId?,
note? }`; idempotent per link; first decision wins.

Install-authenticated surface (existing guard):

- the send extension and the poll/ack endpoints above.

Abuse posture: per-IP and per-link rate limits on the public endpoints;
tokens are unguessable; no enumeration endpoint exists; the page renders
nothing but shop-supplied display strings (HTML-escaped).

## Install-side integration

- **Send flow**: builds the `acceptance` payload from the estimate (pending
  estimates send all options; approved estimates send the selected one as a
  single entry), pins `estimateVersion = estimate.version`, and stores the
  returned link URL on the outbound message row for office reference.
- **Worker poller** (extends the 5.4 substrate): fetch undelivered
  decisions → apply → ack. Interval ~1 minute; the homeowner expects the
  shop to "know" quickly.
- **Applying an approval**, in order of checks:
  1. Estimate still exists and is `pending` → approve with the chosen
     option via the existing approval path, actor name "Customer", timeline
     `estimateApproved` ("Customer approved online: <title> — <option>.").
  2. Estimate was edited since the link was minted
     (`estimate.version != link.estimateVersion`) → do **not** auto-approve.
     Record timeline "Customer approved an earlier version of <title> —
     review required." The office finishes the call. This mirrors the
     existing edited-since-sent honesty rule.
  3. Estimate already approved/declined/converted → timeline note only
     ("Customer also responded online: ..."). No state change; office
     action wins races.
- **Applying a decline**: pending → `declined` with actor "Customer" and the
  note in the timeline; otherwise note-only, as above.
- Office UI: the estimate panel shows the acceptance state surfaced from the
  outbound message row ("Awaiting customer response · link expires Jun 30",
  "Customer approved online Jun 14"). No new screens — it lands in the
  existing review panel and history.

## Field/permissions interactions

Customer online approval is exactly the case the repair-quote bypass
permission anticipated: the decision quality is the customer's, not a
tech's. No permission changes are needed — the poller applies decisions as
a system actor, and `estimates:send` continues to gate who can put an
estimate in front of a customer.

## What this phase does NOT do

- No homeowner accounts, portals, or saved anything.
- No signature capture (legal-grade e-sign is a later, deliberate add).
- No durable BellField receipts (deferred, unchanged).
- No payment collection — that is 6b.

## Payment links (Phase 6b sketch — constraints only)

Decided posture: BellField pages never touch card data or shop processor
keys. The shape to design when 6a ships: the install creates a
processor-hosted checkout session (e.g. Stripe Checkout) **outbound** at
invoice-send time and the email links straight to the processor's page;
payment confirmation reaches the install either via the processor's own
outbound-poll API (install polls the session status — no relay involvement
at all) or, if webhooks prove necessary, via the established
webhook-at-relay/poll-from-install pattern. Open questions deliberately
left for the 6b design: session expiry vs invoice validity, partial
payments/deposits, and whether the relay needs any role at all in the happy
path.

## Shipping prerequisite (owner decision required)

D7 requires "a dedicated host or VPS before Phase 6 ships" because
acceptance-page downtime is homeowner-visible. Since that decision, the
relay moved to the dual-purpose laptop — dedicated in practice except for
gate-day reboots. Before 6a goes in front of a real homeowner, the owner
decides: promote the laptop to genuinely dedicated (gate days move to other
hardware), or move the relay to a small VPS. Building 6a does not wait on
this.

## Build order

1. **6a.1 Relay**: schema + link minting in the send path + the public
   decision page and endpoint + poll/ack API + rate limiting. Testable
   end to end with curl before any install work.
2. **6a.2 Install**: send-flow extension ({acceptanceLink} token, version
   pinning), worker poller with the application rules above.
3. **6a.3 Office surfacing**: acceptance state on the estimate panel and
   history; copy per the no-leakage rule.

Owner decisions to confirm before 6a.1 merges: link expiry default (30
days proposed), homeowner note allowed on decline/approve (proposed: yes,
≤500 chars, shown only in the job timeline), and the exact customer-facing
page copy set (drafted during 6a.1 review like the 5.5 copy was).
