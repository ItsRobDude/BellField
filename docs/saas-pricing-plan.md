# BellField SaaS Pricing Plan (Deferred + Staffing-Gated)

**Status:** deferred and staffing-gated. Hosted SaaS is a confirmed eventual goal (see [server-build-plan.md §8](./server-build-plan.md)) but is **not** on the current plate. The whole managed/Cloud offering — hosting, support, onboarding, paid setup, SLAs — is an ops business that needs staff; a solo founder can't run it alone. **Pre-team, the near-term business is the buy-once self-hosted license** (low-touch: customers run it, BellField ships updates via the relay). This doc captures the pricing model for when SaaS comes off the back burner. Drafted 2026-06-18 from a working session (Rob + Claude + a Codex pass); wedge/pricing defaults accepted 2026-06-19.

## 1. Spine: segment by deployment, not by discount

BellField can do what pure-SaaS competitors can't: keep the low-cost promise on **one** product and price the other at what hosted responsibility actually costs.

- **Self-hosted** = ownership product, buy once + 1% on facilitated payments. Price-sensitive small shops live here. This keeps the "low-cost / practical for small shops" identity.
- **Cloud** = convenience product, priced for hosting + support + onboarding. It can carry a real floor *because the cheap door (self-host) stays open.* At launch, Cloud is for shops that can pay to make the server problem disappear, not the cheapest possible way to use BellField.

This framing is what makes the Cloud floor defensible without betraying the small-shop identity. A pure-SaaS competitor has to serve cheapskates on the same SKU and gets pinned low; BellField segments by deployment instead.

## 2. Core rule (the revenue mechanic)

> Monthly Cloud invoice = **plan minimum OR tapered BellField Payments fee, whichever is higher**, plus hard variable overages (SMS / storage / GPS).

"Use our payments and the fee can cover your subscription. BYO processor or mostly cash/check is fine - you just pay the hosted floor." Covers the per-tenant cost in every case; never feels double-charged.

The license price / Cloud floor is the real business engine. Payments are an
optional convenience path and offset, not the core margin strategy. BellField
should not be incentivized to keep card rates high just to make money.

## 3. Plans (planning defaults — included users + per-user overage, NOT wide hard caps)

| Plan | Monthly | Annual | Included active users | Overage | Best for |
|---|---:|---:|---:|---:|---|
| Cloud Starter | $149 | $129 | 3 | +$25/user | Small shops that still want zero-ops hosting |
| Cloud Shop | $299 | $249 | 10 | +$20/user | Normal serious small shop |
| Cloud Growth | $599 | $499 | 25 | +$15/user | ~15-35 users, heavier usage/support |
| Dedicated Cloud | from $1,200 | custom | 40+ / custom | custom | 35+ users, multi-location, dedicated resources/SLA |

**Amendment vs. hard caps:** each plan **includes a user count, then charges a modest per-user overage** (e.g., +$25/user) rather than a wide "up to 15 users" band. This closes the margin hole where a 14-user, BYO-processor, mostly-cash shop sits at the top of a cheap band and payments don't backstop the cost. Bands give predictability; the overage makes cost track usage when payments don't.

Count **active employee accounts** only. Archived/inactive employees are free so BellField never pressures a shop to delete history or distort old records. Do not charge by customers, jobs, appointments, invoices, records, or locations.

There is **no public $99 Cloud production tier at launch**. Price-sensitive small shops are steered to self-hosted BellField; Cloud can add a cheaper self-serve rung later if onboarding/support become automated enough to carry it.

## 4. Payments (optional convenience path, not the engine)

Tapered, **published**, and calculated marginally like brackets internally:
each band applies only to that slice of monthly processed volume. Customer-facing
copy should call this **tiered by monthly processed volume**, not "tax brackets."
This looks fair and avoids feeling like a tax at volume.

- 0.75% on the first $100k/mo processed
- 0.50% on the next $400k/mo ($100k-$500k)
- 0.25% above $500k/mo
- plan minimum still applies

The fee base is successful settled BellField-facilitated payment volume, net of
refunds. Refunds reverse the related platform fee pro rata; if the refund lands
after the monthly billing window closes, apply the reversal as a credit on the
next invoice.

**Reconciliation with the existing 1%:** the codebase hardcodes 1% for self-hosted/relay payments. Keep it deliberate — **self-hosted stays 1%** (no subscription, so the take-rate is its only recurring capture); **Cloud tapers below 1%** because the plan floor already covers the base.

Card-rate posture:

- Stripe-first is a convenience implementation, not a permanent claim that BellField has the best card rate.
- Do not sell BellField Payments as "lower card processing." Sell it as the easiest built-in option.
- Large invoices should be nudged toward bank/ACH payment where appropriate; ACH is the low-cost rail, not cheaper card processing.
- ACH has real tradeoffs: slower settlement, possible delayed returns, and ledger/reconciliation work for returned payments. Prefer it for established or repeat customers and larger invoices, not every one-time stranger payment.
- BYO processor remains first-class. Serious shops with negotiated merchant rates should be able to use their own processor path over time, even if BellField earns no payment margin on that volume.
- Do not design a speculative grand provider abstraction now. Keep Stripe-specific details contained; extract the real provider seam when provider #2 is actually implemented.
- As BellField's Stripe Connect volume grows, negotiate platform/custom pricing and pass through enough savings to keep the customer-facing rate honest. Do not depend on retail Stripe pricing as the long-term competitive rate.

Example (Cloud Shop @ $249 annual):

- $0 card volume → pays $249
- $20k → fee $150 → pays $249 (floor)
- $50k → fee $375 → pays $375
- $150k → $750 + $250 ≈ $1,000
- $600k → $750 + $2,000 + $250 ≈ $3,000

## 5. Usage add-ons (operational cost-plus — never profit centers)

- **Email / document sends:** bundled generously (Starter 2k / Shop 10k / Growth 25k per mo); overage ~$0.01/send. Email is trivially cheap (Resend transactional ≈ $0.90/1k); never the profit center.
- **SMS:** $20/mo line + compliance per shop; ~$0.05/segment; pass through unusual carrier/10DLC fees. Priced as an operational add-on (compliance, deliverability, opt-out, support noise), not raw API resale (Twilio ≈ $0.0083 + carrier fees).
- **Storage:** Starter 25GB / Shop 100GB / Growth 300GB included; overage $0.15–0.25/GB/mo. Object storage is cheap, but backups, retention, restore work, and video growth are not.
- **GPS / live tracking:** basic location stamps included; live fleet tracking $5–8 per active field user/mo, or $49/shop + usage. Don't bury it in cheap plans if it becomes a map/API/battery/support headache.

## 6. Setup / onboarding — DEFERRED until staffed

Setup fees are a correct lever at scale (onboarding/support is the cost monster, and a fee also filters tire-kickers). **But Rob is not offering paid setup until BellField has employees/help** — a solo founder can't deliver managed onboarding, and the process doesn't exist yet.

- **Pre-team:** no paid setup, no support tiers, no managed onboarding or SLA commitments. Don't sell what can't be delivered.
- **Post-hire** (when someone exists to do it): Starter ~$299 (waived on annual), Shop ~$799–999, Growth ~$1,500–2,500; extra import/training hourly.

This gate applies to the whole Cloud offering, not just setup (see status note).

## 7. How it scales (infra + where the cost really is)

- **Tenancy:** container-per-tenant + database-per-tenant on **pooled** compute nodes and **pooled** Postgres clusters (separate DB per tenant), per-tenant backups/restores; heavy customers graduate to dedicated resources (Dedicated Cloud). Preserves isolation without one VPS/managed-DB per tiny tenant wrecking margins.
- **Revenue engine stays license / Cloud floor first:** payments can add convenience revenue, but the durable business should not depend on customers accepting worse card rates. Lower-cost rails and BYO processing are part of the ownership promise.
- **The binding constraint at scale is support + onboarding, not infra.** Invest in self-serve onboarding and in-product guidance to keep cheap tiers low-touch. This is also *why* §6 is staffing-gated.

## 8. Launch decisions now accepted

1. **Wedge:** Cloud launches as the zero-ops convenience product for shops that can pay for managed hosting. Tiny/price-sensitive shops are steered to self-hosted BellField. Do not add a public ~$99 Cloud production tier at launch.
2. **Included users:** use the defaults in §3 unless later real customer data proves they are wrong: Starter 3, Shop 10, Growth 25, Dedicated custom; overages step down by tier.
3. **Payment taper:** self-hosted facilitated payments stay at 1% while Stripe is the convenience path. Cloud uses the marginal/bracket-style taper in §4, with the plan minimum as the floor. The above-$500k rate is published at 0.25%, not a custom-pricing cliff. Revisit rates once BellField can offer lower-cost rails, BYO gateway support, or negotiated platform pricing.
4. **Entry shape:** no forever-free production Cloud tenant with real business data. Use a 30-day trial, a fake-data public demo/sandbox, and manual founder/pilot comps when strategically useful.
5. **Staffing trigger:** Cloud does not launch until BellField has automated tenant provisioning, automated billing, monitored backups, a tested restore process, a written incident runbook, and at least one other human who can handle onboarding/support. Paid setup starts only when someone other than Rob can reliably deliver it.

These are planning decisions, not an instruction to build Cloud now. Reprice against live infra, payments, and competitor costs before launch.

## 9. What we will NOT do

- No 10x comms markup; email is never the profit center.
- No per-customer / per-job / per-record pricing (punishes growth, breaks the history-preservation identity).
- No paywalling core accounting/safety features or data export.
- No support tiers, SLAs, or paid setup the team can't actually deliver (§6).
- No forever-free production Cloud tier while Cloud uses isolated tenant infrastructure.
- No public $99 Cloud tier at launch just to look cheap; the low-cost offer is self-hosted.
- No hidden custom payment-rate cliff above $500k/mo; the published Cloud taper continues.
- No "best card rate" claim while the first rail is Stripe retail plus a BellField platform fee.
- No speculative second-provider build before a real second processor/gateway is chosen.
- Monthly always available; annual is a discount, not a lock-in cage.

---

_Cost sanity sources (2026-06-18): Resend pricing, Twilio SMS + 10DLC fees, Stripe Connect application fees, DigitalOcean managed databases, Cloudflare R2 pricing, Jobber pricing._
