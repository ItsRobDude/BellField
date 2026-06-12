# BellField Positioning and Pricing

Decided with the owner 2026-06-12. This is the controlling doc for what
BellField _is_ in the market and what it costs. Product scope decisions
should be checked against this before being checked against any competitor
scorecard.

## The one-liner (official)

> **You buy it once, it runs in your shop, your data and your card
> processing are yours, and it never stops working.**

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
stays guarded in every future decision.

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

## Pricing (starting anchors, decided)

| Item                     | Price                                            | Notes                                                                                |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| License, up to ~5 users  | **$4,500 one-time**                              | ~2.5 months of ST's 7-user cost; ~1/8 of MobiLogic.                                  |
| License, up to ~15 users | **$7,500 one-time**                              | Per-shop tiers. Never per-seat nickel-and-diming — simplicity is part of the brand.  |
| Updates                  | **First year included, then ~$900/yr, optional** | Industry-normal ~15–20% maintenance. Lapsing never stops the software (sacred line). |
| Delivery relay           | **$0.03/send**, 1,000/mo default quota           | Already decided (delivery-relay-plan §2).                                            |
| Managed remote access    | **~$15/mo, optional add-on**                     | See [remote-access-plan.md](./remote-access-plan.md). BYO route is free.             |

Buyer math for the pitch: _less than three months of ServiceTitan, and it's
yours forever._

Held in reserve, not built: a finance-to-own payment plan (the MobiLogic
footnote) for shops that can't write the check — same positioning, easier
swallow. Pilot shops may be discounted or comped for evidence/testimonials.

## The supported-path support philosophy (owner rule, 2026-06-12)

Wherever a shop can bring its own service (VPN, email domain, card
processor, accounting), BellField must make the **supported path guided and
easy — walk them through it** — precisely so the owner-operator of BellField
does not become free support staff for third-party products. Bring-your-own
is allowed; unguided is not. This rule applies to remote access (Tailscale
walkthrough), custom sending domains (DNS records displayed, support
assists), and the future processor connection.
