# Pre-Release Site — Copy and Design Draft

Status: **DRAFT for owner markup** (2026-06-12). Controlling strategy lives
in [positioning-and-pricing.md](./positioning-and-pricing.md) §Go-to-market.
Every string below is proposed copy; mark up freely. Square brackets are
facts only the owner can fill in.

## Build shape (decided)

One static page at the `bellfield.app` root. Cloudflare Pages, $0/month, no
framework needed. Real product screenshots, not illustrations. The waitlist
form posts to a simple email-capture endpoint (decide at build: Cloudflare
Pages function writing to a KV list is the zero-dependency option).

## Visual direction

Calm and plain, like a well-made shop tool — deliberately the opposite of
SaaS gradient-blob sites. Light page, sturdy type (system stack or one
workhorse face), generous whitespace, a restrained two-color palette drawn
from the office app so product screenshots look native on the page. No stock
photos of smiling technicians, no illustrations, no animation. The product
screenshots are the visuals: dispatch board, estimate builder, the
Bookkeeping surface.

---

## Page copy (top to bottom)

### Hero

> **Buy it once. It runs in your shop. It never stops working.**
>
> BellField is field-service software — dispatch, estimates, invoices,
> payments — that runs on a computer you own. No subscription required to
> keep operating. Your data never leaves your building.

[Screenshot: dispatch board]

### The deal (three short columns or stacked blocks)

> **You own it.** One purchase, per shop — not per seat, not per month. The
> software keeps working whether or not you ever pay us again.
>
> **Your data stays yours.** Customers, jobs, invoices, and photos live on
> your server, in your office. Internet down? Keep working.
>
> **Your money stays yours.** Card payments run through your own processor
> at your own rates. We never sit in the middle of your revenue.

### How it works

> BellField installs on a Windows PC in your office — if you've installed
> QuickBooks Desktop, you can install BellField. Office staff use it in a
> browser; technicians use the field app on a tablet, online or off. Email
> your customers estimates they can approve from their phone.

[Screenshot: estimate with approval link / field app]

### Honest status block

> **Where we are:** BellField runs daily in a real HVAC office — ours. We're
> getting it ready for a small group of founding shops. It is not for sale
> to the public yet, and we won't pretend otherwise.

### Founding pricing

> | BellField license (up to 5 users) | **$4,500, one time** |
> | BellField license (up to 15 users) | **$7,500, one time** |
>
> First year of updates included. After that, updates are about $900/yr —
> and entirely optional, because the software never stops working if you
> skip them. Founding shops get assisted setup free.
>
> _For comparison: ServiceTitan quoted a 7-user shop $64,800 over 36
> months._

### Waitlist

> **Founding-shop slots will be limited.**
> Leave your email and we'll tell you when they open — that's the only thing
> we'll ever send you.
>
> [email field] [Notify me]

### Footer

> Built by people who run a service business, not a software company that's
> heard of one. Questions: [hello@bellfield.app — mailbox to be created]

---

## About page / founder story (also the launch-post seed)

Owner voice; facts in brackets are Rob's to confirm or correct:

> I'm Rob. I work in a real HVAC office — [N] people, real dispatch board,
> real Saturday emergencies.
>
> When we went shopping for software, ServiceTitan quoted us $64,800 for
> three years. Another vendor wanted [~$35,000] on a finance plan to "own"
> it. Everything was a subscription, everything lived on someone else's
> servers, and everything stopped working the day you stopped paying.
>
> So I built the thing we actually wanted: software you buy once, that runs
> on a computer in your own office, where your customer list and your card
> processing belong to you. Our shop runs on it every day.
>
> BellField isn't trying to be everything. It does dispatch, estimates,
> invoicing, inventory, and the books-adjacent work a small shop actually
> does — carefully, with your history kept safe. And it will keep doing that
> whether or not you ever send us another dollar, because that's the whole
> point.

## Out of scope for the pre-release page (on purpose)

- No feature grid, no comparison table yet (that's launch-site material,
  built on the grievance-free math pages).
- No self-serve buying, no demo environment, no chat widget.
- No blog shell — the SEO pages get added as they're written, not as empty
  scaffolding.

## Owner decisions captured here

- Founding pricing IS published on the page (decided 2026-06-12).
- Status copy is honest about pre-release state (brand rule).
- Waitlist promise is specific and single-purpose; no newsletter.

## Open items before build

- [ ] Owner markup of every quoted string above
- [ ] Fill the bracketed facts in the founder story
- [ ] Pick/create the public contact mailbox (hello@ or support@)
- [ ] Choose 2–3 screenshots (dispatch, estimates, field app) and scrub any
      real customer data from them
- [ ] Decide whether Rob's photo goes on the About block (recommended, not
      required)
