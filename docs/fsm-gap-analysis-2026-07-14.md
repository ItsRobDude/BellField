# BellField vs. the FSM Market — Gap Analysis & Design Self-Audit (2026-07-14)

## Attribution

| Field          | Value                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Operator agent | **Claude** (Anthropic) via Claude Code — **not** Codex; Codex's lane is gate-day install operation  |
| Model          | Claude Fable 5 (`claude-fable-5`)                                                                   |
| Date           | 2026-07-14                                                                                          |
| Requested by   | Rob (owner)                                                                                         |
| Pass type      | Gap analysis + design self-audit (deep pass on accounting, inventory, and less-obvious features)    |
| Prompts        | Operator prompt verbatim in Appendix A; all four subagent prompts verbatim in Appendix B            |
| Registry       | This pass and all prior/future passes are indexed in [research-pass-log.md](./research-pass-log.md) |

## Method And Caveats

- **ServiceTitan evidence this pass is public-surface**: live Chrome walk of
  servicetitan.com feature pages (accounting, accounts payable, inventory,
  payroll/timesheets, Pricebook Pro, service agreements, the Pro add-on suite)
  plus third-party pricing/review aggregators. The logged-in tenant session
  used by the 2026-06-12 pass had expired; **no login was attempted**. Feature
  claims from marketing pages are paraphrased and should be treated as
  vendor-stated, not tenant-verified.
- **BellField evidence is code-audited, not browser-driven**: four read-only
  subagents (prompts in Appendix B) audited the repo — accounting depth,
  inventory/purchasing/catalog, design/UX foot-guns, and the workflow
  frontier — with file-level evidence. Per the rubric's evidence rules, code
  evidence is the strongest kind for `[Code]` rows and weaker than a browser
  drive for look-and-feel rows.
- **This is not a scored rubric rerun.** The 2026-06-12 scorecard
  ([fsm-comparison-servicetitan-2026-06-12.md](./fsm-comparison-servicetitan-2026-06-12.md))
  remains the current official score. A formal rescore should ride the next
  live-tenant walk plus a BellField browser drive; this pass feeds it.
- Rule reminder from [positioning-and-pricing.md](./positioning-and-pricing.md):
  comparison docs **measure; they do not steer**. Scope decisions check
  identity first.

## BellField Movement Since The 2026-06-12 Scorecard (code-evidenced)

Shipped since the last pass, per [whats-shipped.md](./whats-shipped.md) and the
dated smoke docs — all of it lands on rubric rows 9, 10, 12, 13, 14:

- **Customer acceptance links** (Phase 6a, live-smoked 06-13): relay-hosted
  `/a/<token>` approve/decline with office-visible status.
- **Invoice email + payment links** (Phase 6b, live sandbox smokes 06-14/15):
  posted-invoice email from `billing@bellfield.app`, amount-scoped Stripe
  Checkout links, job-level deposits (online + manual), overage confirmation,
  allocation rules, idempotent worker application.
- **Refunds**: manual full/partial and provider-confirmed online refunds with
  append-only allocation reversal (live sandbox smoke 06-15/16).
- **Receipts**: automatic customer payment/refund receipt emails across all
  four slices (manual/online × payment/refund), owner-editable templates,
  exactly-once enqueue inside the money transaction.
- **Durable gapless invoice numbering** (`INV-`/`ADJ-`/`CR-`, shared series,
  owner-settable next number, DB-enforced uniqueness).
- **Service agreements** (Phase 6 first pass): record lifecycle, coverage,
  visit templates, reports + CSV, field read-only coverage. No automation yet.
- **Sellability**: Gates 1–3 proven on clean Windows (rerun 30 — install,
  backup/restore, real installed update), Gate 4 automation landed (PR #94).
- **Identity/session hardening** and per-employee scoping of offline queues.

Directional read: Track A's biggest 06-12 losses were comms breadth, payments,
and reporting. Payments has moved substantially; comms moved on the money loop
only (receipts) — operational comms (confirmation/reminder/on-my-way) remain
unbuilt; reporting gained accounting-handoff reports but still lacks the owner
KPI landing.

## Competitor Intelligence (fresh evidence, this pass)

### What ServiceTitan's deep modules actually contain (vendor-stated)

**Accounting.** Near-real-time export to QuickBooks Online / Sage Intacct; an
internal general ledger with downloadable detailed-or-summarized journal
entries; **accounting periods with a monthly close** so transactions can't
drift after close; audit-trail logs; AR views for invoice aging, payment
status, and **bank deposits**; deposit/overpayment handling that can move
payments between invoices and apply payments in bulk; automated refunds.

**Accounts payable.** A whole paid suite: bill capture (including non-PO
bills), vendor credits and statements, an automated inbox that matches bills
to receipts and POs, manual bill reconciliation before export, 3-way matching
with discrepancy/fraud flagging.

**Inventory.** Multi-location tracking (trucks/warehouses), purchases, vendor
returns, transfers, adjustments; **replenishment templates / custom stock
lists per location that trigger restock**; a dedicated barcode-scanning
Inventory App; technician stock check + reserve/request from the field.
Notably, ServiceTitan refers customers to **paid third-party consultants**
(Powerhouse Consulting Group, Go Time Success Group) for inventory
implementation — the module is heavy enough to need a services ecosystem.

**Payroll/timesheets.** Timesheets auto-populated from dispatch state
(drive time, vendor runs, wrench time); configurable overtime rules;
office clock-in/out; automated commission/bonus ("performance pay")
configuration; technicians see their own timesheet live, can flag
discrepancies, and **digitally sign off each pay period**; payroll costs
flow into job costing across departments; GPS ties timesheets to visits;
pre-dispatch paid time requires an explicit timesheet code (audit-trailed).

**Pricebook Pro** (paid add-on). Flat-rate content out of the box (Smart
Start seeds a few hundred common services), regional pricing averages,
data-backed upsell recommendations, professional images/explainer PDFs, and
**continuous content updates to costs/descriptions/sold-hours**. The pitch
implicitly concedes the base pricebook takes weeks to set up and hours per
week to maintain.

**Service agreements/memberships.** Proposal generation from
equipment/location/cost details; email or in-person **digital signatures**;
**automated renewals**; automatic scheduling of recurring visits;
reminders/follow-ups (visits due, expiring agreements, expiring cards);
**agreement-level budgeted-vs-actual margin** on labor, burden, and materials.

**The Pro paywall.** Marketing Pro, Contact Center Pro, Scheduling Pro,
Dispatch Pro, Fleet Pro, Field Pro, Pricebook Pro — the headline automation
story is sold as per-module add-ons on top of the per-tech license.

### Market economics (third-party reported; ST does not publish pricing)

| Product       | Reported price shape (2026)                                                                          | Onboarding                            | Contract                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| ServiceTitan  | ~$245–$500 per **technician** per month, tier- and deal-dependent; Pro modules extra                 | $5k–$50k+ implementation, 3–12 months | 12+ month term; early-termination fees reported $5k–$20k+ |
| Housecall Pro | $79 / $189 / $329 per month tiers (1 / 1–5 / up to 8 users); GPS, advanced reporting etc. as add-ons | self-serve                            | monthly or annual                                         |
| Jobber        | ~$29–$249 per month tiers + ~$19–29 per extra user on upper tiers; route optimization now included   | self-serve                            | monthly or annual                                         |

Recurring small-shop complaints about ServiceTitan across reviews/forums:
overwhelming for teams under ~10 techs, long implementations (BBB complaints
about paying a year without being fully onboarded), expensive add-ons, slow
support, and teams using "the bare features" because staff are afraid of the
surface area. Sources in Appendix C.

### What this means for BellField's wedge

BellField's deal — **one-time purchase, self-hosted, no per-tech tax,
runs-forever** — is the exact inverse of the pain the market reports. The
product implication: for every "deep" module, ship the ~20% a 5–25 tech shop
actually uses, working in minutes not months, rather than chasing module
parity. The rest of this doc names that 20% per area.

## Deep-Dive Findings

### Accounting depth (subagent audit)

**Headline: one money-correctness bug found, and the handoff layer — not a GL — is the real gap.**

**The tax trap (bug-grade, day-one).** Invoice drafts are created with the
column-default tax rate of **0 bps** and only estimate conversion ever writes
a rate (`apps/api/src/database/migrations/20260601_002_invoice_drafts.up.sql`;
`apps/api/src/modules/company-data/jobs-data-repository-utils.ts:72`;
`apps/api/src/modules/invoices/invoices.repository.ts:796`). Register-reflected
lines are hardcoded `taxable=true` but 0 bps ⇒ $0 tax
(`apps/api/src/modules/company-data/invoice-reflection-utils.ts:93`).
Adjustments/credits also insert at rate 0 and never inherit the main's frozen
rate (`invoices.repository.ts:664`), and there is **no route or office UI** to
set a draft's header rate. Net: any register-first or manual-line invoice, and
every adjustment/credit, posts with **$0 sales tax** — contradicting
[product-rules.md](./product-rules.md) §8. Spun off as its own fix task on
2026-07-14.

**What exists and is strong** (file evidence in the pass transcript): the full
draft→post→lock lifecycle with frozen bill-to/location/job snapshots and
race-proofed mutators; adjustments/credits as separate posted rows; gapless
`INV-/ADJ-/CR-` numbering serialized in the post transaction; manual + online
payments, deposits (online + manual, purpose-durable), refunds (manual +
provider-confirmed) with append-only allocation reversal; automatic customer
payment/refund receipts (owner-editable templates, exactly-once); AR aging,
open-balance, sales-tax, posted-invoice, payment-ledger, job-profitability
CSVs; job costing with immutable cost events, weighted-average material cost,
finalized snapshots, and reversal-only corrections; money permissions split
across view/create/edit/post/send/refund with separately gated exports.

**What a bookkeeper hits in week one (gaps, ordered by bite):**

1. The tax trap above (correctness).
2. **No date-range on any report/CSV** — sales-tax summary is all-time; a
   monthly filer diffs two exports (`apps/api/src/modules/reporting/reporting.controller.ts`
   has zero query params).
3. **No customer statements; AR is job-level only**, aged from posted date
   (due dates don't exist) — a property manager with 12 open jobs appears 12
   times with nothing to send them.
4. **Credit balances / unapplied deposits are invisible cross-job** — the
   open-balance query filters `amountDue > 0`, so the deposit-liability figure
   is unobtainable without walking jobs
   (`apps/api/src/modules/bookkeeping/open-balance-query.ts:112`).
5. **CSVs identify invoices by UUID**, not the `INV-1042` number the product
   mints for reconciliation; printed/emailed invoices show **no paid-to-date /
   amount-due** block (`apps/api/src/modules/invoices/invoice-document.ts:86`).
6. **QuickBooks re-keying**: catalog carries `income_category` /
   `accounting_export_code` but they dead-end there — never snapshotted onto
   invoice lines, never exported; no journal-shaped export; no export-status
   marking (deferral acknowledged in [catalog-phase-plan.md](./catalog-phase-plan.md) §9).
7. **No period lock** — payments can be recorded/voided/refunded into a month
   the owner already filed; audited but unguarded.
8. **Labor cost realism**: labor is manual hours × typed rate (no employee
   rates/burden/timesheets), so labor-heavy margins read optimistic; the
   engine at least flags incomplete cost.

**Where BellField already beats the ST pattern:** derived balances from
append-only ledgers (no stored balance to corrupt — ST's batch ceremony exists
to manage mutation risk BellField structurally lacks); posting freezes
display reality against CRM edits; one shared gapless number series (the
Xero/QBO model); refund math enforced at six named paid-total sites with
tests; report and worklist share one CTE so they cannot disagree; exports are
permission-gated at all.

**Deliberately do NOT copy from ST:** in-app GL/chart of accounts,
batch-posting ceremony, custom report builder, payroll/commission engines.
BellField stays the **system of original entry** with bookkeeper-ready,
period-scoped, number-keyed CSVs plus a journal-summary export — QuickBooks
entry in five minutes, no API integration.

**Incidental (non-money) catches:** the printable HTML invoice renders no
company/shop identity at all (the emailed PDF does); payment batches group by
a UTC date cast, so late-evening local payments land in the next day's batch.

### Inventory / purchasing / truck stock / catalog (subagent audit)

**Headline: the rubric row-11 checklist is fully shipped; the competitive
exposure is entirely in the "second ring" a parts-heavy shop hits after week
one.**

**Shipped and strong** (file evidence in the pass transcript): item catalog +
stock locations (warehouse/truck/other, truck→employee); immutable 7-kind
movement ledger with unit-cost snapshots, provenance, and reversal links;
derived on-hand + weighted-average valuation with advisory-lock concurrency
safety and over-issue rejection; adjust/transfer/issue with finalized-job
locks; PO draft→ordered→received with the one-destination rule as a **DB
check constraint**, actual-cost receiving, and the equipment bridge
(pendingInstall assets, no double-count, historical phantom rows repaired);
field truck-stock picker that sends **no cost data to the device**, offline
capture, and server-side anti-spoof re-verification of every (item, truck,
actor) triple with graceful `needsResolution` degradation; catalog with
kinds/categories/tax defaults/sell-price snapshots/good-better-best and
permission-tiered internals (sell-side only without `catalog:edit`).

**Gaps, ordered by how soon a real parts-heavy shop hits them:**

- **Day 1 — no pricebook/inventory import.** A shop moving off
  ST/FieldEdge/spreadsheets has 500–5,000 items and no path but hand-typing
  into two surfaces. The single biggest adoption blocker for exactly the
  segment inventory serves (and `GET /operations/catalog/items` is
  unpaginated).
- **Week 1 — no reorder points/replenishment** (the one ST inventory feature
  small shops actually use); **no partial receipts/backorders** (one-shot
  receive forces "receive short and lose the remainder" — the
  `purchase_receipts` schema already supports N receipts; the blocker is the
  status machine, and the `'closed'` PO status has no writer); **vendor is
  freetext** ("Ferguson" vs "ferguson #2" fragments history; no terms, no
  preferred vendor, no last-cost).
- **Month 1 — cost drift**: receiving captures real cost but nothing compares
  it to `cost_hint`/`default_sale_price` or flags margin erosion (the honest
  core of the Pricebook Pro pitch). **Labor auto-costing missing**: the spec's
  company burdened rate was never built, so _every_ field labor line lands
  `needsResolution` and the office types hours × rate each time — the honest-
  cost design currently generates a permanent office chore. **Agreement
  pricing not wired**: `agreementPrice` + `priceMode` exist in contracts and
  snapshots, but every writer hardcodes `'standard'` — Phase 6 sold member
  pricing that changes no price anywhere. **No cycle counts** (nobody counts
  trucks without a worksheet). Cost-resolution is per-job only — no cross-job
  worklist.
- **Quarter 1 —** no barcode (Expo camera is already an approved dependency);
  no returns-to-vendor movement kind (warranty returns become fake shrinkage);
  job→stock PO provenance gap (parts ordered for a job but delivered to
  stock can't reference the job, and receiving never nudges the
  `waitingOnParts` queue); no kits/flat-rate task expansion; no item images.

**Where the simpler model is already better than ST:** on-hand _cannot_
disagree with history (derived from the append-only ledger; corrections are
reversals — every gap above is a new movement writer, never a balance
migration); split-destination receiving errors are unrepresentable; cost is
either right or visibly unfinished (never a silent $0); catalog ≠ inventory
(a short catalog works day one — ST's monolithic pricebook is why shops pay
for Pricebook Pro maintenance); ST needs a paid-consultant ecosystem to
implement inventory, BellField needs a CSV.

**Deliberate non-goals (posture-correct):** FIFO/LIFO and multi-currency;
a full AP/vendor-bill module (cost truth enters at receiving; accounting is
handoff, not a QuickBooks rebuild); PO approval chains (the owner is the
approver at this size); ST's managed flat-rate content subscription
(HVAC-centric content licensing vs trade-neutral import rails); dynamic
pricing matrices (one standard + one agreement price is the honest model);
warehouse bins/pick-pack; full field inventory management (techs pick parts,
they don't run inventory).

**Recommendations (sized):** catalog+inventory CSV import/export with dry-run
validation + pagination (M); vendor master (S/M) → reorder points +
"below minimum" replenishment view with draft-PO-per-vendor (M) → partial
receipts + wire the dead `'closed'` status (M); cost-drift worklist —
"Pricebook Pro, the boring version" (M); wire agreement pricing (S/M);
burdened labor rate setting + cross-job cost-resolution worklist (S);
cycle-count worksheet posting variance as an adjustment batch (M).

### Design/UX self-audit (subagent audit) — "where we're shooting ourselves in the foot"

**Structural reality:** the office "design system" is one 401-line inline-style
map (`apps/office-web/src/modules/operations/office-workspace-styles.ts`) and
an **empty `src/components/` directory** — no Button/Dialog/Toast/FormField
components exist, and inline styles mean no hover/focus styling is possible
anywhere.

**What's already genuinely good:** per-surface loading/empty/error discipline
is near-universal with strong empty-state copy; the no-internal-leakage rule
is **test-enforced** (zero env-var/provider leakage found; diagnostics
correctly confined to System); the estimates section is the maturity benchmark
(dirty-draft guard, double-click guard, queued-send polling with Cancel);
dispatch drag/resize/reassign with live overlap warnings and keyboard context
menu; duplicate-customer detection with "Create anyway / Keep editing"; intake
state survives navigation; field app has offline queue badges, finish-review
flow, sign-out-with-unsynced-work warning, full i18n.

**P0 — embarrasses in a demo / risks data or money:**

1. **F5 = logged out and everything lost; no deep links; Back exits the app.**
   The office app is one Next.js route with all navigation in `useState` and a
   memory-only session token (`office-auth-shell.tsx:52`). Nobody can bookmark
   or share "job 1042"; an accidental refresh mid-demo returns to login.
2. **Unsaved estimate drafts are destroyed by rail navigation** — the dirty
   guard only covers tab switches inside job detail
   (`job-detail-tabs.ts:32`); left-rail clicks and Back unmount unconditionally;
   no `beforeunload` anywhere.
3. **Double-submit creates duplicate records** — CRM create panels have zero
   in-flight guards (`crm-panel.tsx:288`; two fast clicks = two customers);
   same class on register save, media caption, appointment save, equipment
   add. Estimates/invoice sections prove the team knows the fix — it isn't
   shared.
4. **Startup dead end** — if the initial dispatch fetch fails, the whole
   workspace is "Dispatch is not ready yet." with no retry
   (`office-workspace-loading-state.tsx:23`), and mid-session 401s outside
   `refreshWorkspace` leave the user stuck instead of routing to sign-in.

**P1 — daily friction (selected):**

- Dispatch board misses its own density recipe: no hover card, no
  status-bucket counters, no multi-visit counter (the chip-filter pattern to
  copy already exists in `jobs-queue-panel.tsx:91`).
- Job header falls short of [screen-behavior-spec.md](./screen-behavior-spec.md)
  §7: location/bill-to links only exist inside the Overview tab; no
  technician, next-appointment, or WO number in the header.
- The single global error/notice slot renders errors far from the click, never
  auto-dismisses, and the 60s dispatch auto-refresh **silently wipes any
  displayed error** (`office-workspace-shell.tsx:163`).
- Back from job detail always goes to Dispatch even when opened from
  Bookkeeping/History — a bookkeeper reviewing 10 invoices gets bounced 10
  times.
- **Formatting is scattered**: `formatCurrency` defined 5× with hardcoded
  `en-US` while reports use browser-locale; four date dialects on adjacent
  screens; raw ISO dates in jobs queue/bookkeeping; 24-hour text time inputs
  against 12-hour display.
- **Unbounded fetches**: the append-only inventory movements ledger is fetched
  whole; catalog, on-hand, POs, agreements likewise; **bookkeeping hard-caps
  at 50 rows with no load-more — an open balance beyond row 50 is invisible
  money** (`office-workspace-bookkeeping-surface.tsx:77`).
- Placeholder-only forms; three unlabeled bare `type="date"` inputs on
  equipment create; raw enum values reach the UI (`pendingInstall`); CRM
  search has no "no results" state.
- **`window.confirm` for money/destructive actions in 15+ places** (invoice
  posting, permanent equipment delete, voids) — native "localhost says…"
  chrome in a money product, while the styled inline-confirm pattern already
  exists. Appointment status is a `<select>` that fires the API on change.
- Contrast: the everywhere-metadata color `#7b8794` at 0.85rem ≈ 3.66:1 —
  fails WCAG AA.
- Job timeline has no filters (spec §7 requires them) and dead-ends at
  "Latest 50 shown."; **office cannot upload attachments at all** (Media tab
  is caption/void/open only).

**P2 (selected):** two competing H1 scales; success-green boxes used for
neutral loading/empty states; the login screen is visually a different product
(and the only localized office surface); "DNU" jargon badge; popover
keyboard/focus gaps; field app ships permanent dead-end Messages/Settings
tabs against the standards' hide-don't-tease rule; System/Reports invent
their own colors/tab styles; plain Arial vs the spec's "modern, polished";
raw "Failed to fetch" reaches users; `office-workspace-shell.tsx` (1,026
lines) and `operations-api.ts` (1,029) breach the repo's own 800-line rule.

**The five systemic fixes (fix once, heal everywhere):**

1. **URL-backed navigation + persisted session** — kills the F5 trap, the
   re-login dead end, back-to-origin, and unlocks spec-required deep links.
   Single biggest demo-quality jump.
2. **Three shared primitives** in the empty components dir:
   `SubmitButton`/`useAsyncAction` (busy + double-click guard),
   `ConfirmAction` (styled confirm replacing 15+ `window.confirm`s),
   `FormField` (visible label + inline error) — retires three whole finding
   classes.
3. **One `format.ts`** (currency/date/dateTime/time, one locale decision).
4. **Scoped, self-dismissing messages** rendered at the action site;
   background refreshes stop clearing/overwriting them.
5. **Pagination/caps on list APIs** mirroring the existing jobs-queue cursor
   pattern (movements, catalog, POs, agreements, bookkeeping load-more).

### Workflow frontier (subagent audit)

**Stale-doc corrections found by this pass** (fixed in the same PR):

- **Drag/drop dispatch is shipped**, not "Not Started": drag-to-move,
  drag-to-resize, and cross-row reassignment incl. unassigned↔tech
  (`apps/office-web/src/modules/operations/use-dispatch-timeline-drag.ts`,
  `dispatch-timeline-row.tsx:270`), landed 2026-06-07 with live overlap
  warnings. Route optimization genuinely remains not started.
- **Intake typeahead is shipped**: intake context now returns technicians only
  (`apps/api/src/modules/jobs-appointments/jobs-appointments.service.ts:108`);
  intake UI uses debounced SQL-backed CRM typeahead. The whats-shipped "Intake
  at scale" open-work row was stale.
- The real unbounded-list landmine moved: `GET /operations/jobs` still loads
  ALL customers/locations/jobs, consumed by the **inventory issue-to-job and
  purchasing PO job pickers**
  (`office-workspace-inventory-surface.tsx:124`,
  `office-workspace-purchasing-surface.tsx:128`). Size S to fix.

**Known gaps, validated and sized** (S = one focused PR lane, M = multi-PR
slice, L = new subsystem):

| Gap                                               | Current state                                                                                                                                                                                           | Reuse leverage                                                                                                                                                                                                                                                                                                                                                                                                                                    | Size                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Unsold-estimates worklist                         | Nothing cross-job; but `EstimateSummary` already carries status, totals, sent/acceptance state, decline reasons — everything ST's Follow Up grid shows                                                  | Bookkeeping worklist is a literal template (bounded SQL → surface → row opens job)                                                                                                                                                                                                                                                                                                                                                                | **S**                               |
| Owner "needs attention" landing                   | No dashboard view exists; landing = dispatch                                                                                                                                                            | Composes worklists that mostly exist: open balances ✔, expiring agreements ✔, unsold estimates (S), approved-not-scheduled (S — `hasFutureAppointments` exists), revenue trend (S — `POSTED_NET_BILLED_SUM` fragment centralized)                                                                                                                                                                                                               | **M**                               |
| Booking confirmation / reminder / on-my-way email | Not started; outbox DB-constrained to estimate/invoice, relay transactional enum to receipts only                                                                                                       | **Strongest reuse story in the audit**: payment-receipt lane is a complete blueprint (enqueue-in-txn exactly-once, worker retry loop, owner templates, toggles, timeline logging); trigger choke points exist (appointment create, `onTheWay` status with offline `occurredAt` replay); JobRunner is the reminder scheduler substrate. New work: relay message types + a third sender identity, per-job suppression flag, reminder timing setting | **M** total, decomposes to S slices |
| Dispatch card density                             | Card face is arguably done (status rail, job # chip, name, Review/Overlap chips, adaptive detail line, right-click menu). Missing vs ST recipe: **hover card** and **status-bucket counters**           | Read model already carries nearly the whole hover payload; buckets are client-side derivation; only contact phone needs one SQL column                                                                                                                                                                                                                                                                                                            | **S**                               |
| Agreement automation                              | Phase 6 shipped lifecycle + visit templates; reports already compute projected due dates in a 60-day window                                                                                             | Visit-prompt rows carry jobType/summary/duration/locations → one-click job creation via existing `createJob` (needs generated-period dupe guard) **M**; renewal action **S–M**; recurring billing **L** (agreement invoices have no job home — real design problem)                                                                                                                                                                               | M / S–M / L                         |
| GPS/time tracking                                 | Nothing; but appointment status transitions are a de-facto time clock (timestamps + offline replay), and `job_cost_events(kind='labor')` is exactly the right sink                                      | Cheap first slice: **status-derived visit-durations report (S, no schema)** → structured time entries + auto-labor (M) → true GPS (L)                                                                                                                                                                                                                                                                                                             | S→M→L                               |
| Recurring/multi-day/capacity                      | No recurrence fields (agreements are the rail); multi-day supported structurally, no N-day quick action (S); no capacity sublabel on tech rows — "5.5h booked · 3 visits" is pure client derivation (S) | —                                                                                                                                                                                                                                                                                                                                                                                                                                                 | S each                              |

**Gaps the known list missed** (daily CSR/dispatcher reality):

1. **Search breadth (HIGH)**: office search covers name/phone/address/email —
   but **not job #, invoice #, or equipment serial**, all three explicitly
   required by [screen-behavior-spec.md](./screen-behavior-spec.md) §2. A CSR
   holding a posted invoice or reading a serial off a unit cannot reach the
   record. Extends the scored-union CRM search naturally. Size M (S per
   entity).
2. **Double-booking warnings exist client-side** (board drag + Overlap chips);
   missing server-side warning for schedule writes from job detail/field. S.
3. **Job duration defaults**: none — board hardcodes a 90-min render default
   (`dispatch-timeline-row.tsx:534`); every intake schedules blind. S.
4. **Customer confirm loop**: `confirmed` status is office-set only; the
   acceptance-link pattern (relay public token page + worker poll/ack) is a
   complete blueprint for a confirm link in the booking email. M, after comms.
5. **Emergency/priority intake**: no priority field or dispatch badge; today
   it's a summary-text convention. S.
6. **Callback/warranty linking**: no `related_job_id`; "Callback" exists only
   as a jobType string, so callback rate is unreportable (blocks tech
   scorecards later). Mirrors the equipment replacement-link pattern. S.
7. **Printable work order**: estimate/invoice document renderers exist;
   nothing renders a job. S, demand-driven.
8. **End-of-day review**: per-job rail exists (finished-visit review flag +
   queue); status-bucket counters on a past date give the day-scoped summary
   ~free (fold into density work).
9. **Tech running-late tint**: derivable from window vs status timestamps;
   matters once on-my-way emails raise the stakes. S, defer until comms.

**Reporting breadth today**: 11 reports (AR open balances shares its query
with the bookkeeping worklist; AR aging; sales tax; posted invoices + payment
ledger CSV-only; 4 agreement reports incl. visit prompts; job profitability;
inventory valuation). Missing from the owner-KPI recipe: revenue trend,
unsold estimates, approved-not-scheduled (each one-query cheap), tech
scorecards (S for visits/hours, M for revenue attribution on multi-tech jobs).

## How BellField Does It Better (synthesis)

The pattern across all four audits and the market data is consistent:
**ServiceTitan's weight is not just its moat — it's its wound.** $245–500 per
tech per month, $5k–50k implementations, 3–12 month onboardings, paid
consultants for inventory, paid Pro modules for automation, and small teams
reporting they use "the bare features" because staff fear the surface area.
BellField does not win by cloning modules; it wins by making the 20% a 5–25
tech shop actually uses work in minutes, on hardware they own, at a price
that ends.

Per area, the BellField-shaped answer:

1. **Accounting: be the system of original entry, not the GL.** ST built
   accounting periods, batch ceremony, and reconciliation reports largely to
   manage mutation risk; BellField's append-only ledgers structurally don't
   have that risk. Sell that ("your books cannot drift"), and ship the
   handoff instead: period-scoped, invoice-number-keyed CSVs, a
   journal-summary export a bookkeeper enters in QuickBooks in five minutes,
   statements, deposit-slip-shaped payment batches, and a soft period lock.
   No in-app GL, no live API sync until real customers demand it.
2. **Inventory: boring beats big.** The immutable ledger + one-destination
   PO make whole error classes unrepresentable — extend that with the four
   boring features shops actually use (CSV import, vendor master, reorder
   points, partial receipts) and skip everything that made ST inventory need
   consultants. "ST needs an implementation partner; BellField needs a CSV"
   is a sales line worth engineering toward.
3. **Pricebook: import rails, not licensed content.** Trade-neutral means
   never buying ST's content-subscription fight. Great import/bulk edit, a
   cost-drift review worklist when receipts move costs, honest "Price not
   set", and wiring the already-modeled agreement price deliver the value
   without the maintenance treadmill Pricebook Pro monetizes.
4. **Comms: triggered + logged on owned rails.** Booking confirmation,
   reminder, and on-my-way emails ride the receipt-lane blueprint end to end
   (enqueue-in-transaction, retries, owner templates, per-job suppression,
   timeline logging) — table-stakes parity ST partly gates behind Pro
   modules, delivered without SMS provider costs until demanded.
5. **Time/GPS: derive, don't surveil.** Appointment statuses techs already
   tap are a de-facto time clock with offline replay; a status-derived
   visit-durations report is free today, structured time entries feeding the
   existing labor-cost sink come next, GPS last with technician-visible
   policy. ST's own design (status-driven timesheets + sign-off) validates
   the shape; BellField skips the payroll engine and exports instead.
6. **Design: make "simple" true, not claimed.** The five systemic fixes
   (URL-backed navigation + persisted session, three shared primitives, one
   formatter, scoped messages, list pagination) convert an honest-but-rough
   office app into the intuitive product the positioning promises — and they
   are prerequisites for demos, not polish. Density work (hover card + status
   buckets) then adopts ST's best dispatch idea without maps/routing bloat.
7. **Close the sold-but-not-delivered loops.** Two were found: agreement
   member pricing (modeled, never applied) and the printable invoice's
   missing company identity/amount-due. Loops like these cost trust far
   beyond their size; both are small.

## Consolidated Priorities

Cross-audit ranking, money-correctness first, then reuse-weighted
(owner → office → field). Sizes from the per-area audits.

**Tier 0 — correctness and trust (start immediately):**

1. **Invoice tax-rate inheritance fix** (S) — the $0-tax bug; spun off as its
   own task on 2026-07-14.
2. **Design foundation four-pack** (each S–M, systemic): URL-backed
   navigation + persisted session; `SubmitButton`/`ConfirmAction`/`FormField`
   shared primitives; one `format.ts`; scoped self-dismissing messages.
   Kills all four P0s and the double-submit/duplicate-record class.
3. **Bookkeeping load-more + list pagination** (S) — a 50-row cap must never
   hide an open balance; movements/catalog/PO/agreements lists get the
   existing cursor pattern.

**Tier 1 — money visibility and the accountant handoff (cheap, rails exist):**

4. Report **date-range params** (S); **invoice numbers in CSVs** +
   paid-to-date/amount-due on printed/emailed invoices (S); **credit-balance /
   unapplied-deposit worklist** (S).
5. **Unsold-estimates worklist** with dollar total (S) → **owner
   "needs attention" landing** (M: open balances ✔, unsold estimates,
   approved-not-scheduled, expiring agreements ✔, revenue trend).
6. **Customer statements** (M); **payment terms + due dates** (M);
   **accounting handoff v2** — income-category snapshot onto lines +
   journal-summary CSV + exported-through marking (M); **soft period lock**
   (M).

**Tier 2 — comms and dispatch polish (the visible ST gap):**

7. **Operational comms slices**: booking confirmation (S + the one relay
   enum/sender change) → appointment reminder (S + JobRunner scan) →
   on-my-way (S, hooks the existing `onTheWay` transition); per-job
   suppression from slice one.
8. **Dispatch density pack** (S): status-bucket counters + hover card +
   phone on the card payload (buckets double as end-of-day review); capacity
   sublabel per tech row (S); job duration defaults (S); emergency/priority
   flag (S); callback/warranty job link (S); server-side overlap warning (S).
9. **Office search breadth**: job #, invoice #, equipment serial (M) — the
   spec requires all three; CSRs hit this daily.

**Tier 3 — inventory/catalog second ring:**

10. **Catalog + inventory CSV import/export** with dry-run validation +
    catalog pagination (M) — the #1 adoption blocker for parts-heavy shops.
11. **Vendor master** (S/M) → **reorder points + replenishment view** (M) →
    **partial receipts** + wire the dead `closed` status (M).
12. **Burdened labor rate + cross-job cost-resolution worklist** (S) — stops
    the every-labor-line office chore.
13. **Wire agreement pricing** (S/M) + **agreement visit-prompt → one-click
    job creation** with dupe guard (M) + renewal action (S–M).
14. **Cost-drift worklist** (M).

**Tier 4 — bigger bets (design before build):**

15. Status-derived **visit-durations report** (S, free today) → structured
    time entries feeding labor cost (M) → GPS with technician-visible policy
    (L).
16. Customer **confirm-appointment loop** on the acceptance-link pattern (M,
    after comms slices).
17. Recurring **agreement billing** (L — needs the invoice-home design
    decision); QuickBooks API sync (L, demand-gated); field estimate builder
    (L, already roadmapped).

A formal rubric rescore should follow the next live-tenant ST walk once
Tier 0–1 land; expected movement concentrates in rows 2, 10, 13, and 14.

## Appendix A — Operator Prompt (verbatim)

> lets do another observation to close some of the competitive gaps between
> bellfield and service titan etc. please use the chrome plugin and do another
> comparison pass and see what gaps exist between what we offer versus service
> titan and how we can do it better, spin up some agents and do a deeper pass.
> we need to think of more than surface value things and also how accounting,
> inventory, and other less obvious features can be improved upon to be
> competitive while maintaining a user friendly and intuitive design. we might
> also see if we're already suffering on design issues anywhere or where we
> might already be shooting ourselves in the foot etc. lets document this
> pass. include your name, date, prompts etc and lets keep track of research
> passes like this and make sure your passes never get confused for codex's or
> another agent etc.

## Appendix B — Subagent Prompts (verbatim)

Four read-only subagents were launched in parallel (Claude Code `Agent` tool,
type `general-purpose`, inheriting model `claude-fable-5`). Their prompts,
verbatim:

### B.1 Accounting depth audit

```text
READ-ONLY audit — do not modify, create, or delete any files. You are auditing BellField, a self-hosted field-service management (FSM) product for small trade shops (owner → office → field priority, trade-neutral), in the pnpm monorepo at C:\Users\rober\Documents\dev\BellField. Apps: apps/api (NestJS + Postgres), apps/office-web (React), apps/field-mobile (Expo RN), apps/worker, apps/relay (BellField-hosted delivery relay). BellField is benchmarked against ServiceTitan. Its posture: boring/maintainable/history-safe, small-shop friendly, bring-your-own payment processor, one-time-purchase self-hosted licensing (no per-tech SaaS pricing). Today is 2026-07-14.

MISSION: audit everything money/accounting-shaped in BellField and find competitive gaps vs what a real small trade shop (5–25 techs, part-time bookkeeper) needs, and vs ServiceTitan-style "deep accounting".

Read first: docs/whats-shipped.md, docs/product-rules.md (money sections), docs/workflows-and-state-machines.md (invoice/payment lifecycle), docs/refunds-design.md, docs/positioning-and-pricing.md (identity — what BellField refuses to become), docs/fsm-comparison-servicetitan-2026-06-12.md (row 10 + the "accounting export bar" recipe). Then go deep in code: apps/api/src/modules/invoices, apps/api/src/modules/bookkeeping, apps/api/src/modules/reporting, apps/api/src/modules/job-costing, apps/worker/src/jobs/payments, apps/api/src/modules/catalog (tax defaults), and the office-web invoice/bookkeeping surfaces (apps/office-web/src/modules/operations).

Map each capability as exists / partial / absent WITH file evidence:
- Invoice lifecycle: draft/post/lock/snapshot, adjustments/credits, durable invoice numbering, printable/emailed documents
- Payments: manual, online Stripe links, deposits, refunds (manual + online), receipts, allocation rules, voids
- Tax: how computed, item-level defaults, sales-tax summary report, multi-rate/multi-jurisdiction support or not
- AR: aging report, open-balance worklists, customer statements, payment terms / due dates, late fees, credit balances across jobs, write-offs/bad debt
- Exports/handoff: CSV reports (AR aging, sales tax, job profitability, inventory valuation, payment ledger), payment batches, any GL mapping or QuickBooks/Xero export shape, period close/locking
- Job costing: labor/expense events, finalized snapshots, reversals — and what's missing for true profitability (labor burden rates, overhead allocation, commissions/spiffs)
- Payroll adjacency: timesheets, commission calc — anything at all?
- Safety rails: append-only ledgers, audit trails, permission gates on money actions

Then the gap analysis: what would a bookkeeper hit in week one that's missing? Which gaps are cheap because rails already exist vs which need new subsystems? Where is ServiceTitan's accounting heavyweight in ways BellField should deliberately NOT copy — and what's the simpler BellField-shaped equivalent?

Return structured markdown: (1) current-state inventory table (capability → status → evidence paths); (2) gap analysis for a real shop; (3) where BellField's approach is already better/simpler/safer; (4) top 5–8 prioritized recommendations, each sized S/M/L with a one-line why-it-fits-the-posture. Cite relative file paths for every current-state claim. Your final message is raw data for a synthesis doc, not prose for a human.
```

### B.2 Inventory and catalog audit

```text
READ-ONLY audit — do not modify, create, or delete any files. You are auditing BellField, a self-hosted field-service management (FSM) product for small trade shops, in the pnpm monorepo at C:\Users\rober\Documents\dev\BellField. Apps: apps/api (NestJS + Postgres), apps/office-web (React), apps/field-mobile (Expo RN), apps/worker. Benchmarked against ServiceTitan (incl. its Pricebook Pro / inventory module). Posture: boring/maintainable/history-safe, small-shop friendly, trade-neutral. Today is 2026-07-14.

MISSION: audit inventory, purchasing, truck stock, and the Catalog/pricebook, and find the competitive gaps vs what a parts-heavy shop (HVAC/plumbing/electrical, 5–25 techs) needs and vs ServiceTitan's inventory + pricebook.

Read first: docs/whats-shipped.md, docs/catalog-phase-plan.md, docs/inventory-job-costing-plan.md (historical), docs/job-costing-from-field-capture-spec.md, docs/fsm-comparison-rubric.md row 11 checklist. Then code: apps/api/src/modules/inventory, apps/api/src/modules/purchasing, apps/api/src/modules/catalog, apps/api/src/modules/job-costing, packages/contracts/src/catalog.ts, the office-web Inventory/Purchasing/Catalog surfaces (apps/office-web/src/modules/operations), and field-mobile truck-stock/Add Work composer paths (apps/field-mobile/src/modules/operations).

Map each as exists / partial / absent WITH file evidence:
- Inventory: item catalog, stock locations (warehouse/truck/other), immutable movement ledger, on-hand + weighted-average valuation, adjust/transfer/issue-to-job
- Purchasing: PO draft→order→receive lifecycle, one-destination rule, actual-cost capture, equipment bridge, job-bound customer-destination POs
- Field: truck-stock picker, offline capture, auto-costing on sync
- Catalog: item kinds (service/part/labor/fee/discount/agreement), categories, tax defaults, sell-price snapshots, good/better/best options, estimate/register/invoice integration
Then probe the LESS OBVIOUS gaps a real shop hits: reorder points/min-max + replenishment suggestions; vendor records + vendor price lists + preferred vendor per item; barcode/QR scanning; stocktake/cycle counts; serialized inventory; kits/assemblies; returns-to-vendor; PO approvals; partial receipts/backorders; item images; markup/margin pricing rules (cost-plus tiers, member pricing); supplier catalog imports and cost-update propagation to sell prices (the ST Pricebook Pro pitch); pricebook bulk edit/import-export; multi-warehouse maturity.

Also answer: where is BellField's simpler model actually BETTER (e.g., immutable movement ledger, one-destination POs) than ST's complexity, and which ST inventory features are enterprise bloat a 5–25 tech shop never uses (deliberate non-goals)?

Return structured markdown: (1) current-state inventory table (capability → status → evidence paths); (2) gap analysis prioritized by how soon a real shop hits it; (3) deliberate non-goals with reasoning; (4) top 5–8 prioritized recommendations sized S/M/L. Cite relative file paths for every claim. Your final message is raw data for a synthesis doc, not prose for a human.
```

### B.3 Design/UX foot-gun audit

```text
READ-ONLY audit — do not modify, create, or delete any files. You are auditing BellField, a self-hosted field-service management product for small trade shops, monorepo at C:\Users\rober\Documents\dev\BellField. Primary target: apps/office-web (React office app). Secondary: apps/field-mobile (Expo RN). Today is 2026-07-14.

MISSION: find where BellField is already shooting itself in the foot on design/UX — concrete, file-pointed findings, severity-ranked. This is a self-audit ahead of competitive polish work vs ServiceTitan; the goal is honest, not flattering.

Read first so you flag deviations from BellField's OWN stated intent (not personal taste): docs/screen-behavior-spec.md, docs/engineering-standards.md, docs/glossary.md, and docs/fsm-comparison-servicetitan-2026-06-12.md ("Design recipes" section — esp. the dispatch density recipe).

Sweep for:
1. CONSISTENCY: button styles/variants, dialog/drawer patterns, toast vs inline error surfaces, table patterns, spacing/headers, date/time/currency formatting (one shared formatter or scattered ad-hoc formatting?), terminology drift vs glossary.md (e.g., "job" vs "work order", "technician" vs "tech").
2. STATES: loading, empty, and error states per major surface — which panels lack them, render raw error strings, or fail silently? Are fetch failures surfaced or swallowed?
3. FOOT-GUNS: destructive actions without confirmation; actions that lose unsaved input (dialog close, navigation); forms that clear on error; missing busy/disabled guards allowing double-submit; unbounded lists that will fall over at scale (known: job intake loads all active customers — find others).
4. COPY: internal leakage into UI (env var names, provider/internal plumbing terms in customer-facing OR general office surfaces — the rule: customer-facing UI never mentions providers/env vars/internals; "Contact BellField support" is the correct customer-facing copy; diagnostics belong in the System surface); placeholder/TODO copy; inconsistent capitalization/casing.
5. INFORMATION DENSITY: dispatch board cards and job screens vs the ST density recipe (compact card face + hover detail + status-bucket counters). What's on a BellField dispatch card today vs that recipe? What's on the job header?
6. ACCESSIBILITY BASICS: inputs without labels, missing keyboard handling/focus management in dialogs/drawers, color-only status signaling, contrast token usage.
7. NAVIGATION: dead ends (surfaces reachable only one way or not linked), missing deep links (can you link directly to a job/customer?), back behavior.

Method: inventory the shared UI primitives first (what components/utilities exist and where), then grep for divergence (raw <button>, inline styles, ad-hoc fetch error handling, window.confirm vs styled dialogs, toFixed/currency formatting call sites, alert(), console.error-only paths). Sample the biggest surfaces: dispatch board, job detail (all tabs), intake, bookkeeping, inventory, purchasing, agreements, settings.

Output: (1) inventory of shared primitives + what's already GOOD (patterns worth extending); (2) findings ranked P0 (embarrasses in a demo / risks data or money) / P1 (daily friction) / P2 (polish), each with file:line evidence and a one-line fix direction; (3) the 3–5 systemic fixes with the highest leverage (fix-once-heal-everywhere). Cite relative paths. Your final message is raw data for a synthesis doc, not prose for a human.
```

### B.4 Workflow frontier audit

```text
READ-ONLY audit — do not modify, create, or delete any files. You are auditing BellField, a self-hosted field-service management product for small trade shops, monorepo at C:\Users\rober\Documents\dev\BellField. Apps: apps/api (NestJS + Postgres), apps/office-web (React), apps/field-mobile (Expo RN), apps/worker, apps/relay. Benchmarked against ServiceTitan. Comms posture: triggered + logged, never spammy. Today is 2026-07-14.

MISSION: audit the office/field WORKFLOW frontier — the known competitive gaps plus the ones nobody has written down — and size how much of each gap is pure reuse of rails that already exist.

Read first: docs/whats-shipped.md ("Open Work" + "Not Started"), docs/fsm-comparison-servicetitan-2026-06-12.md (recommendations + design recipes), docs/customer-comms-and-delivery.md, docs/workflows-and-state-machines.md, docs/screen-behavior-spec.md (dispatch/intake sections), docs/product-rules.md.

PART 1 — validate and size the KNOWN gap list. For each, confirm current state in code, identify which existing rails make it cheap (relay send loops + owner-editable template engine in worker receipt jobs, dispatch read model, agreements visit templates, reporting module, estimates data), and size S/M/L:
a) Unsold-estimates worklist + owner "needs attention" dashboard (apps/api/src/modules/reporting, bookkeeping worklists as pattern)
b) Email-first operational comms: booking confirmation, appointment reminder, on-my-way — riding the existing relay + receipt-template rails
c) Dispatch card density: what a card face shows today (apps/api/src/modules/dispatch + apps/office-web/src/modules/operations/dispatch-board-panel.tsx) vs the ST recipe (compact face + hover card + status-bucket counters)
d) Service-agreement automation: what Phase 6 shipped (apps/api/src/modules/service-agreements, visit templates) vs auto visit/job generation, renewal workflow, recurring billing
e) GPS/time tracking (not started) — what appointment-status rails exist to hang it on
f) Intake typeahead at scale (whats-shipped says intake still loads all active customers; SQL prefix search exists in CRM — confirm both)
g) Recurring jobs / multi-day jobs / capacity indicators on dispatch

PART 2 — find gaps the list MISSES that a real CSR/dispatcher hits daily. Probe in code and docs: search breadth (can office search find by phone, address, invoice #, equipment serial — check the actual search implementation in apps/api/src/modules/crm and any global search); double-booking/overlap warnings on dispatch; job duration defaults for scheduling; tech running-late / no-show handling; customer appointment confirmation loop (customer says yes/no); after-hours/emergency intake; callback/warranty-job linking (job linked to prior job); printable work orders for techs; end-of-day dispatch review. For each miss: what exists, severity for a working shop, size.

PART 3 — reporting breadth: list every report that exists today (apps/api/src/modules/reporting) vs the owner-KPI landing recipe (revenue trend, unpaid invoices, unsold estimates, approved-not-scheduled, expiring agreements, tech scorecards). Which are one-query cheap on existing data?

Output structured markdown: current state w/ file evidence per item, gap severity for a working shop, reuse leverage, S/M/L size, and a top-8 priority order across all three parts. Your final message is raw data for a synthesis doc, not prose for a human.
```

## Appendix C — Sources

**ServiceTitan public pages (walked live in Chrome this pass):**

- https://www.servicetitan.com/features (taxonomy incl. AR/AP, three-way matching, payables, timekeeping, tech tracking, customer portal, financing)
- https://www.servicetitan.com/features/accounting
- https://www.servicetitan.com/features/accounts-payable
- https://www.servicetitan.com/features/contractor-inventory-software
- https://www.servicetitan.com/features/contractor-payroll-software
- https://www.servicetitan.com/features/pro/pricebook
- https://www.servicetitan.com/features/pro
- https://www.servicetitan.com/features/service-agreement-software

**Pricing/pain-point aggregators (web search, third-party, unverified):**

- https://projul.com/blog/servicetitan-pricing-analysis-2026/
- https://myquoteiq.com/servicetitan-pricing/
- https://fieldcamp.ai/reviews/servicetitan/
- https://procured.us/articles/servicetitan-pricing
- https://www.getonecrew.com/post/servicetitan-reviews
- https://www.getjobber.com/comparison/jobber-vs-housecall-pro/
- https://www.housecallpro.com/compare/housecall-pro-jobber/
- https://korekomfortsolutions.com/jobber-vs-housecall-pro-pricing-hidden-fees-real-costs-2026/
