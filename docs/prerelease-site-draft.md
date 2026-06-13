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

## Visual direction (refined after the v2 mockup, 2026-06-12)

Calm and plain, like a premium tool catalog — deliberately the opposite of
SaaS gradient-blob sites. Plain must read as _chosen_, never careless; the
guards against "plain site = basic software" are depth evidence (the
What's-inside list, multiple real screenshots) and craft signals, not
decoration:

- **Serif display face for the headline, price figures, and section
  lead-ins** — shifts the register from cold-minimal to trade-print.
  Body stays a sturdy sans.
- **Green rhythm**: the deep green accent (#1f6f43 family, shared with the
  customer acceptance page) recurs down the scroll — thin top rule,
  section kickers, icons, status box, button — rationed, never flooded.
- Warm paper background, near-black ink, generous whitespace, big type.
- Real product screenshots are the visuals and supply most of the color
  (the dispatch timeline with its status accents is genuinely colorful).
  No stock photos, no illustrations, no animation.

---

## Page copy (top to bottom)

### Hero

> **Buy it once. It runs in your shop. It never stops working.**
>
> Dispatch, estimates your customers approve from their phone, invoicing,
> and an offline-capable field app — running on a computer you own. No
> subscription required to keep operating. Your data never leaves your
> building. (Optional services — email sending, updates after year one,
> managed remote access — are pay-as-you-go and never required to keep
> working.)

[Screenshot: dispatch board]

### The deal (three short columns or stacked blocks)

> **You own it.** One purchase, per shop — not per seat, not per month. The
> software keeps working whether or not you ever pay us again.
>
> **Your data stays yours.** Customers, jobs, invoices, and photos live on
> your server, in your office. Internet down? Keep working.
>
> **Your money stays yours.** Card payments can run through your own
> processor at your own rates — nobody forces a percentage on you.

(Copy rule, owner-decided 2026-06-12: never print "we never sit in the
middle of your revenue" or any absolute that forecloses the future optional
BellField-facilitated processing tier. The promise is "never forced," not
"never offered.")

### How it works

> BellField installs on a Windows PC in your office — if you've installed
> QuickBooks Desktop, you can install BellField. Office staff use it in a
> browser; technicians use the field app on a tablet, online or off. Email
> your customers estimates they can approve from their phone.

[Screenshot: estimate with approval link / field app]

### What's inside (anti-"basic" depth proof; compact two-column list)

> Dispatch board with a live technician timeline · Good/better/best
> estimates customers approve from their phone · Invoicing with posting,
> adjustments, and a real payment ledger · Inventory, purchase orders, and
> job costing · Service agreements and maintenance plans · Reports with CSV
> export · Roles and permissions that actually hold · A field app that
> works offline and syncs back

[Screenshot: estimate builder or inventory surface]

### Honest status block

> **Where we are:** BellField runs daily in a real HVAC office — ours. We're
> getting it ready for a small group of founding shops. It is not for sale
> to the public yet.

### Founding pricing

> | BellField license (up to 5 users) | **$4,500, one time** |
> | BellField license (up to 15 users) | **$7,500, one time** |
>
> Every founding license includes: remote assisted setup (we walk your
> install through on a screen share), your first year of updates, and
> direct support from the people who built it. After year one, updates are
> about $900/yr — and entirely optional, because the software never stops
> working if you skip them. Customer email sending is pay-as-you-go.
>
> _For comparison: ServiceTitan quoted a 7-user shop $64,800 over 36
> months._

### Waitlist

> **Founding-shop slots will be limited.**
> Leave your email and we'll tell you when they open — that's the only thing
> we'll ever send you.
>
> [email field] [Notify me]
>
> Already know you want in? Email us about a founding install:
> [contact mailbox].

### Footer

> Built inside a working HVAC office, for shops like yours.
> Questions: [contact mailbox — create in Google Workspace; support@ or
> > founders@; hello@ does not exist yet]

---

## About page / founder story (also the launch-post seed)

Owner voice; facts in brackets are Rob's to confirm or correct:

> I'm Rob. I'm the service manager at a real HVAC company — I run the
> dispatch board, the scheduling, and the office, [N] people deep, real
> Saturday emergencies. (Voice rule: Rob is office staff/service manager —
> never imply he owned the company.)
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
