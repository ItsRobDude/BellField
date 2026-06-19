# BellField Positioning and Pricing

Decided with the owner 2026-06-12. This is the controlling doc for what
BellField _is_ in the market and what it costs. Product scope decisions
should be checked against this before being checked against any competitor
scorecard.

## The one-liner (official)

> **You buy it once, it runs in your shop, your data and your card
> processing are yours, and it never stops working.**

> **v2 scoping (pending owner sign-off).** The planned trial/refund model
> ([license-refund-trial-plan.md](./license-refund-trial-plan.md)) scopes "never
> stops working" to the version you **own** — a trial you never bought and a
> license you refunded degrade to read-only/export-only, not perpetual
> operation. The refined buyer line is "Buy it once. The version you own runs in
> your shop." This canonical one-liner is left as-is until you bless promoting
> the scoped wording.

## The deal, not the features

BellField differentiates **structurally** (the ownership deal) and
**subtractively** (calm, honest, no bloat, no spam) — never by additive
novelty. Rules of engagement:

- Copy genre conventions freely (dispatch boards, follow-up lists,
  acceptance links are the category's grammar, not anyone's identity).
- Copy zero ServiceTitan identity — visual language, naming, tone stay ours.
- Never let a competitor's rubric become the roadmap. The two-track
  comparison docs measure; they do not steer.
- The honesty posture is brand: BellField says when a record is incomplete,
  when an estimate changed after sending, when a send failed. Suites hide
  these; we surface them.

**The sacred line:** the software never stops working. Renewals buy updates;
the relay bills usage; nothing ever bricks a shop. If a renewal ever becomes
effectively mandatory to keep operating, the positioning is destroyed.
Guarded in code (license design: no runtime kill, no phone-home) and it
stays guarded in every future decision. The planned v2 entitlement model keeps
this sacred line intact **for paid**: operation-gating applies only to trials
and refunded licenses, and the opportunistic revocation check is fail-open, so
no paid shop's operation ever depends on reaching BellField
([license-refund-trial-plan.md](./license-refund-trial-plan.md) §11).

## Who buys it

General service-business owners who book and track appointments —
trade-neutral by hard constraint. The model self-selects for the ownership
temperament: a shop with a PC that stays on, and an owner who wants to own
things. The pitch says "runs on a computer in your office" proudly; that
sentence is a filter, not an apology.

## Market anchors (evidence, 2026-06-12)

From a real quote made to the owner's shop (7 users):

| Vendor       | Model                      | 36 months | 60 months |
| ------------ | -------------------------- | --------- | --------- |
| MobiLogic    | Ownership (finance-to-own) | ~$35,000  | ~$50,000  |
| ServiceTitan | Rental (SaaS)              | ~$64,800  | ~$108,000 |

Two conclusions: the ownership segment exists and pays five figures, and
even the ownership incumbent feels expensive. MobiLogic's own comparison
chart argues the deal (whose computer, who controls backups, internet
required) rather than features — that is the correct fight for an ownership
product, and it is the template for BellField's eventual comparison page,
where BellField also wins the rows MobiLogic loses (modern UI, real offline
mobile, the sticker price).

## Pricing (starting anchors, decided; line-item structure decided 2026-06-12)

The offer is presented as separate lines so setup labor never gets silently
baked into the license and quietly turn into a support treadmill:

| Item                     | Price                                            | Notes                                                                                                  |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| License, up to ~5 users  | **$4,500 one-time**                              | ~2.5 months of ST's 7-user cost; ~1/8 of MobiLogic.                                                    |
| License, up to ~15 users | **$7,500 one-time**                              | Per-shop tiers. Never per-seat nickel-and-diming — simplicity is part of the brand.                    |
| Assisted setup           | **Separate line item; free for founding shops**  | Remote screen-share install, never on-site. Priced after the first installs reveal the real time cost. |
| Updates                  | **First year included, then ~$900/yr, optional** | Industry-normal ~15–20% maintenance. Lapsing never stops the software (sacred line).                   |
| Delivery relay           | **$0.03/send**, 1,000/mo default quota           | Already decided (delivery-relay-plan §2).                                                              |
| Managed remote access    | **~$15/mo, optional add-on**                     | See [remote-access-plan.md](./remote-access-plan.md). BYO route is free.                               |

Pricing is **published, not gated behind a demo call** — including on the
pre-release site as "founding pricing." Hidden pricing is SaaS-vendor
behavior; transparency is part of the anti-rental promise.

Buyer math for the pitch: _less than three months of ServiceTitan, and it's
yours forever._

## The install bar (decided 2026-06-12)

**Anyone who has installed QuickBooks Desktop can install BellField.** The
owner is not available to perform installs; "assisted" means a remote screen
share, never a truck roll. Concretely: download from the credentialed link,
run the signed installer, click through, open the browser, create the owner
account. The architecture already aims here (D2–D4: signed setup.exe,
bundled self-provisioning PostgreSQL, self-registering services,
browser-based first-owner setup); the remaining work is wizard polish, the
relay-token entry step, and proof. **Definition of done: the gate-day
stranger-install test** — a person who is not the owner succeeds with no
help. The first handful of real installs still happen on a screen share on
purpose: every hesitation is an installer bug, and watching them is product
work disguised as support. A full start-to-finish install video ships with
launch — it doubles as the most credible possible marketing proof of
"simple."

Held in reserve, not built: a finance-to-own payment plan (the MobiLogic
footnote) for shops that can't write the check — same positioning, easier
swallow. Pilot shops may be discounted or comped for evidence/testimonials.

## Payments stance (owner-updated 2026-06-12)

Bring-your-own-processor remains the identity default: the shop's own
account, their rates, nobody forced into a skim. **In addition**, the owner
wants an optional BellField-facilitated processing tier (platform model,
e.g. Stripe Connect — BellField is never itself a regulated payments
company) with a transparent fee, for shops that don't want to set up their
own — the same managed-vs-BYO pattern as the relay and remote access.
Guardrails when Phase 6b designs this: BYO stays first-class and switchable
both directions; the fee is published; leaving the managed tier never costs
the shop anything but that convenience (sacred line); the fee must be priced
to cover payments-support noise (payout holds and chargebacks generate the
loudest support traffic there is). Marketing copy must say "never forced" —
never "we never touch your money," which would foreclose this.

Payments positioning clarification (2026-06-19): BellField Payments is a
convenience path, not a "best card rate" promise and not the core business
engine. Stripe/Connect is the practical first rail, but Stripe retail card
pricing plus a BellField platform fee can be more expensive than processors
that own a wholesale/payfac spread. Do not let this surface cold in a sales
call. The honest answer is choice: BellField can offer the easiest built-in
payment link, should make bank/ACH attractive for large invoices where the
settlement/return tradeoffs fit, and must keep BYO processor / negotiated
merchant-rate paths first-class over time. BellField earns primarily on the
license or Cloud floor; payment margin is optional convenience revenue.

## Go-to-market posture (decided 2026-06-12)

The buyer is a small service-business owner, not someone who lives online —
and the owner-operator of BellField is not an outgoing person. Every channel
is chosen to be asynchronous, written or recorded alone, and proof-driven:

- **Pre-release site now**: one plain page on the bellfield.app root
  (Cloudflare Pages, $0/mo). Real product screenshots, the one-liner, honest
  status ("runs daily in a real HVAC office"), founding pricing, and a
  waitlist with a specific promise ("get notified when founding-shop slots
  open") — never a "newsletter." Going up early because the SEO clock only
  starts when pages exist.
- **SEO cost/ownership content is the primary channel**: start with the
  self-hosted/one-time-purchase explainer and real proof content. Comparison
  pages against named vendors are drafted privately until BellField has the
  clean-install proof, a real shop testimonial, and a boring demo path. When
  published, the pages should use real quote data nobody else publishes (the
  dated 7-user ST quote at $64,800/36mo, the MobiLogic quote) and stay
  **grievance-free by rule**: dated quotes, neutral math, zero editorializing
  - let the table do the talking. Ownership, durability, straight math; never
  "they're robbing you."
- **YouTube walkthroughs second**: screen + voiceover, never on camera.
  Includes the full install video.
- **Founder story, written once**: "I work in a real HVAC office; we got
  quoted painful SaaS money; I built the thing we wished existed." Rob is
  the face in the quiet sense — signed About page, personal support email —
  not a personality brand.
- **Trade groups/Reddit: listening post only** until there is a site,
  screenshots, and a pilot result. One optional, honest founder-story post
  after proof exists. No promo grinding, ever.
- **Pilots come from direct asks**: the owner's own shop is pilot #1; 3–5
  personal asks to trade contacts ("I'll set you up free, tell me what
  breaks") seed the rest. This is the only social labor the plan requires.
- **Paid ads (high-intent search terms) are post-revenue only** — no bills
  on maybes.
- Launch is a pipeline, not a moment: a $4,500 considered purchase sells one
  at a time through proof (pilot testimonial, real shop, real numbers).

The pre-release page copy and founder story live in
[prerelease-site-draft.md](./prerelease-site-draft.md).

Low-lock-in is a practical trial/switching message, not just a values pitch:
"try it, and if it is not right, your data is yours." Back that up with real
export, documented backup/restore, BYO processor, published pricing, optional
updates, and the paid-version-never-bricks sacred line. This directly answers
the common buyer fear that switching field-service systems means getting
trapped after a price hike.

## The supported-path support philosophy (owner rule, 2026-06-12)

Wherever a shop can bring its own service (VPN, email domain, card
processor, accounting), BellField must make the **supported path guided and
easy — walk them through it** — precisely so the owner-operator of BellField
does not become free support staff for third-party products. Bring-your-own
is allowed; unguided is not. This rule applies to remote access (Tailscale
walkthrough), custom sending domains (DNS records displayed, support
assists), and the future processor connection.
