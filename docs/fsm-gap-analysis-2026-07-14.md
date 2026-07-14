# BellField vs. ServiceTitan — Gap Analysis & Design Self-Audit (2026-07-14)

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

- **ServiceTitan evidence is a live logged-in tenant walk** at
  `go.servicetitan.com` on 2026-07-14 (same test tenant family as the
  2026-06-12 pass), driven read-only in Chrome: Accounting (batch workspace,
  Journal Entries, Accounting Periods, AR Management, Bank Deposits, AP
  Bills, Accounting Audit Trail), Inventory (Items, Replenishment, Purchase
  Orders, Receipts, Returns, Adjustments/Transfers/Counts), Pricebook
  (Services/Materials/Equipment/Categories, Price Setup, Pricing Builder,
  Templates, Import/Export, Pricebook Connect), and Settings (Payroll, Tax
  Zones, Membership Types). **Strictly read-only**: nothing was created,
  edited, sent, assigned, or saved; no tenant customer data is reproduced
  here — observations are about structure and workflow only. Surfaces not
  re-walked today (dispatch board, job record, estimates/Follow Up, Reports
  library) carry forward the 2026-06-12 tenant observations.
- **Integrity note:** this pass was restarted. A first attempt fell back to
  ServiceTitan's public marketing pages when the tenant session appeared
  expired; the owner rejected that evidence standard ("real product or
  stop"), the tenant walk was run from the second machine's Chrome, and
  every ServiceTitan claim below is tenant-observed. No marketing-page or
  review-aggregator claims remain in this document's findings.
- **BellField evidence is code-audited, not browser-driven**: four read-only
  subagents (prompts in Appendix B) audited the repo — accounting depth,
  inventory/purchasing/catalog, design/UX foot-guns, and the workflow
  frontier — with file-level evidence. Per the rubric's evidence rules, code
  evidence is the strongest kind for `[Code]` rows and weaker than a browser
  drive for look-and-feel rows.
- The **indicative rescore** below moves only rows with hard evidence and is
  labeled indicative because BellField was not browser-driven this pass; the
  next formal scorecard should pair a BellField browser drive with this
  tenant access.
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

## ServiceTitan Tenant Walk — Observed Depth (2026-07-14)

Everything in this section was seen working in the logged-in tenant today.

### Accounting

- **The workspace is batch-centric.** Unbatched-invoices view with a
  payment-type totals strip (cash/check/card brands/ACH, plus
  promotions-discounts, paid, tax, revenue, balance), batch selection/search,
  and actions for Collect Payments, **Charge Interest**, and **Recurring
  Billing**. A right-rail shows a **per-batch QuickBooks export log** with
  real statuses — including "Partially exported. See error report." This is
  the concrete meaning of "QuickBooks integration" at suite level.
- **Journal Entries is a first-class grid** (entry #, name, post date, last
  modified, **last downloaded by/date**) — the bookkeeper-download workflow,
  with download tracking.
- **Accounting Periods**: month-long periods (173 in this tenant), each
  **Open / Partially closed** with closed-through date, date closed, and
  closed-by columns — a _graduated_ close, not a binary lock.
- **AR Management is the statements + collections workspace**: statement
  type + as-of date, invoice-export-status and min-days-past-due filters,
  and a **per-customer** grid: # of invoices, credit, balance, and aging
  buckets (Current / 1-30 / 31-60 / 61-90 / 90+), with per-customer
  **"Printed and Sent" and "Last emailed"** statement tracking and bulk
  actions.
- **Bank Deposits**: deposit records (auto-batched by date/account) with
  total, # of payments, bank account, # of refunds, batch #, **export
  status, review status, deposit status**, and an open-vs-deposited summary
  with reviewed counts — the deposit-slip reconciliation loop.
- **AP Bills** exists as a base surface: vendor, vendor doc #, date billed,
  **due date**, bill #, PO #, job #, project #, line items (empty in this
  tenant, but the workflow is present and PO/job-linked).
- **Accounting Audit Trail**: field-level before/after per user with record
  links and view-details, filterable, downloadable. Observed entries show
  invoices being **field-edited after creation** (batch, due date, summary,
  invoice type, invoice date modified; email-sent events logged). Two
  structural reads: ST invoices are mutable-with-audit (the audit trail
  compensates for the mutation model), and **invoices carry due dates**.

### Inventory and purchasing

- **Replenishment is a first-class view**: truck and warehouse tabs, rows of
  item / location / replenishment source / qty available / **qty to
  replenish** / item cost / total cost, with create actions — min/max stock
  lists driving computed restock.
- **Purchase orders have "Partially Received" as a status tab** (Pending /
  Sent / Partially Received / Received / Canceled), a **Send PO** action,
  required-by dates, and a **vendor dropdown** (vendor master, not
  freetext). Receipts are their own section (multiple receipts per PO).
- **Returns are a full RMA lifecycle**: Pending / Returned / **Credit
  Received** / Canceled, tied to vendor, job #, PO #, reference #, and send
  status — vendor credit closes the loop.
- **Inventory Counts** (count worksheets) and Adjustments/Transfers are
  their own sections.
- **Item Overview** shows valuation, negative-item count, and per-item
  quantity columns **Available / On Hold / On Order / On Hand** — on-order
  visibility straight from POs.

### Pricebook

- **Materials grid carries a "Primary Vendor" column**, bulk serialization,
  an **Edit Mode toggle for inline bulk editing**, and configurable
  columns.
- **Markup rules**: "How would you like to apply mark-ups" with add-markup
  rules for Purchase Orders and Materials (cost → price markup tiers).
- **Price Setup is the flat-rate engine, observed directly**: pick service
  categories, then a modifier panel with **billable rate ($/hr, multiple
  rates supported), surcharge ($ and %), and Member Discount %** with three
  application modes (after labor+service+surcharge / labor only /
  labor+service before surcharge), plus separate add-on rates — service
  prices recalculate from material cost, markups, and sold hours.
- **Import/Export is in the base product**: Excel-template import (file
  type "Pricebook (Settings, Materials and Part Link)", optional
  "deactivate existing pricebook") and an export tab pitched for bulk-edit
  round-trips.
- **Pricebook Connect** hosts manufacturer catalogs in-tenant (Goodman —
  806 items; Lennox — 28,308 items) browsable into the pricebook, with an
  Updates feed for content changes.
- Also present: Pricing Builder, Templates, and a pricebook change History.

### Payroll, tax, memberships (Settings)

- **Payroll Settings**: Employee Payroll Settings, **Legal Terms employees
  sign off on when approving their pay** (the timesheet sign-off loop),
  Labor Types (work classifications), Earnings Codes, custom **Overtime
  Settings**, Timesheet Codes, and Payroll Adjustment Codes (under
  Operations).
- **Tax Zones**: zones with name, **zip-code mapping**, a sales-tax item,
  and **separate service vs material tax rates** per zone.
- **Membership Types**: seven active types in this tenant with billing and
  duration shapes observed — Monthly-Ongoing, Annual-12 Months,
  Quarterly-12 Months, Upfront-6/12 Months, Annual/Bi-Annual-Ongoing —
  owning "service agreement programs, membership discounts, billing
  frequency."

### Carried forward from the 2026-06-12 tenant walk (not re-walked today)

Dispatch board density (compact card face + rich hover + status-bucket
counters + map), the unified job history feed with channel tabs, Follow Up →
Unsold Estimates money grid with dollar total, the owner KPI dashboard
landing, and the 30+ item report library. See
[fsm-comparison-servicetitan-2026-06-12.md](./fsm-comparison-servicetitan-2026-06-12.md).

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
   times with nothing to send them. (ST's AR Management — observed today —
   is customer-level with statement print/email tracking.)
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
   marking (deferral acknowledged in [catalog-phase-plan.md](./catalog-phase-plan.md) §9;
   ST's observed bar is the per-batch export log + downloadable journal
   entries).
7. **No period lock** — payments can be recorded/voided/refunded into a month
   the owner already filed; audited but unguarded. (ST's observed model:
   month periods with a graduated Open → Partially closed → closed-by
   lifecycle.)
8. **Labor cost realism**: labor is manual hours × typed rate (no employee
   rates/burden/timesheets), so labor-heavy margins read optimistic; the
   engine at least flags incomplete cost.

**Where BellField already beats the ST pattern (tenant-confirmed):** the
audit trail we observed today shows ST invoices being field-edited after
creation — batch, due date, even invoice date — with the audit trail as the
compensating control. BellField's derived balances over append-only ledgers
and posted-lock + adjustment/credit corrections make that whole drift class
structurally impossible: no stored balance to corrupt, no filed document that
CRM cleanup can rewrite. One shared gapless number series (the Xero/QBO
model); refund math enforced at six named paid-total sites with tests; report
and worklist share one CTE so they cannot disagree; exports permission-gated
at all.

**Deliberately do NOT copy from ST:** in-app GL/chart of accounts, the
batch-posting ceremony, a custom report builder, payroll/commission engines.
BellField stays the **system of original entry** with bookkeeper-ready,
period-scoped, number-keyed CSVs plus a journal-summary export — QuickBooks
entry in five minutes, no API integration.

**Incidental (non-money) catches:** the printable HTML invoice renders no
company/shop identity at all (the emailed PDF does); payment batches group by
a UTC date cast, so late-evening local payments land in the next day's batch.

### Inventory / purchasing / truck stock / catalog (subagent audit)

**Headline: the rubric row-11 checklist is fully shipped; the competitive
exposure is entirely in the "second ring" a parts-heavy shop hits after week
one — and today's tenant walk confirmed every second-ring feature is real,
base-product ServiceTitan, not marketing.**

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

**Gaps, ordered by how soon a real parts-heavy shop hits them** (each
tenant-confirmed on the ST side today):

- **Day 1 — no pricebook/inventory import.** A shop moving off
  ST/FieldEdge/spreadsheets has 500–5,000 items and no path but hand-typing
  into two surfaces. ST ships Excel-template **Import/Export in the base
  pricebook** (observed), so this is table stakes, not a differentiator.
  (`GET /operations/catalog/items` is also unpaginated.)
- **Week 1 — no reorder points/replenishment** (ST: first-class
  Replenishment view with computed qty-to-replenish per truck/warehouse);
  **no partial receipts/backorders** (ST: "Partially Received" is a PO
  status tab; BellField's one-shot receive forces "receive short and lose
  the remainder" — the `purchase_receipts` schema already supports N
  receipts; the blocker is the status machine, and the `'closed'` PO status
  has no writer); **vendor is freetext** (ST: vendor master driving PO
  dropdowns, primary-vendor on materials, returns, and AP bills; BellField's
  "Ferguson" vs "ferguson #2" fragments history).
- **Month 1 — cost drift**: receiving captures real cost but nothing compares
  it to `cost_hint`/`default_sale_price` or flags margin erosion (ST's
  observed answer is markup rules + Price Setup recalculation + Pricebook
  Connect content updates). **Labor auto-costing missing**: the spec's
  company burdened rate was never built, so _every_ field labor line lands
  `needsResolution` and the office types hours × rate each time. **Agreement
  pricing not wired**: `agreementPrice` + `priceMode` exist in contracts and
  snapshots, but every writer hardcodes `'standard'` — Phase 6 sold member
  pricing that changes no price anywhere (ST: Member Discount % is a
  first-class Price Setup field, observed). **No cycle counts** (ST:
  Inventory Counts section). Cost-resolution is per-job only — no cross-job
  worklist.
- **Quarter 1 —** no barcode (Expo camera is already an approved
  dependency); no returns-to-vendor movement kind (ST: full RMA lifecycle
  with vendor-credit tracking; BellField warranty returns become fake
  shrinkage); job→stock PO provenance gap (parts ordered for a job but
  delivered to stock can't reference the job, and receiving never nudges the
  `waitingOnParts` queue); no kits/flat-rate task expansion; no item images.

**Where the simpler model is already better than ST:** on-hand _cannot_
disagree with history (derived from the append-only ledger; corrections are
reversals — every gap above is a new movement writer, never a balance
migration); split-destination receiving errors are unrepresentable; cost is
either right or visibly unfinished (never a silent $0); catalog ≠ inventory
(a short catalog works day one).

**Deliberate non-goals (posture-correct):** FIFO/LIFO and multi-currency;
a full AP/vendor-bill module (cost truth enters at receiving; accounting is
handoff, not a QuickBooks rebuild — ST's AP Bills/3-way world is the
overbuild to avoid); PO approval chains (the owner is the approver at this
size); manufacturer-content subscriptions à la Pricebook Connect
(HVAC-centric content licensing vs trade-neutral import rails — build the
rails, never license the content); dynamic pricing matrices beyond one
standard + one agreement price; warehouse bins/pick-pack; full field
inventory management (techs pick parts, they don't run inventory).

**Recommendations (sized):** catalog+inventory CSV import/export with dry-run
validation + pagination (M); vendor master (S/M) → reorder points +
"below minimum" replenishment view with draft-PO-per-vendor (M) → partial
receipts + wire the dead `'closed'` status (M); cost-drift worklist (M);
wire agreement pricing (S/M); burdened labor rate setting + cross-job
cost-resolution worklist (S); cycle-count worksheet posting variance as an
adjustment batch (M).

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
| Agreement automation                              | Phase 6 shipped lifecycle + visit templates; reports already compute projected due dates in a 60-day window                                                                                             | Visit-prompt rows carry jobType/summary/duration/locations → one-click job creation via existing `createJob` (needs generated-period dupe guard) **M**; renewal action **S–M**; recurring billing **L** (agreement invoices have no job home — real design problem; ST's observed model bills by membership-type cadence)                                                                                                                         | M / S–M / L                         |
| GPS/time tracking                                 | Nothing; but appointment status transitions are a de-facto time clock (timestamps + offline replay), and `job_cost_events(kind='labor')` is exactly the right sink                                      | Cheap first slice: **status-derived visit-durations report (S, no schema)** → structured time entries + auto-labor (M) → true GPS (L). ST's observed payroll machinery (labor types, earnings codes, OT rules, sign-off legal terms) validates the derive-from-status shape while showing the payroll-engine depth BellField should export to, not rebuild                                                                                        | S→M→L                               |
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

The consistent pattern across the tenant walk and the four code audits:
**ServiceTitan's depth is real — and so is the operational weight it brings.**
Every deep module observed today (batch accounting, AP with bills and
credits, replenishment-driven inventory, the flat-rate pricing engine,
payroll with labor types and sign-off terms, zip-mapped tax zones) is another
surface an office has to configure, staff, and understand. BellField does not
win by cloning modules; it wins by shipping the 20% of each that a 5–25 tech
shop actually uses, working in minutes, on hardware they own.

Per area, the BellField-shaped answer, grounded in what was observed:

1. **Accounting: be the system of original entry, not the GL.** ST's own
   audit trail shows invoices being field-edited after the fact — the batch
   ceremony, export logs, and audit trail exist to manage a mutation model
   BellField structurally doesn't have (append-only ledgers, posted locks,
   derived balances). Sell that ("your books cannot drift"), and ship the
   handoff instead: period-scoped, invoice-number-keyed CSVs, a
   journal-summary export a bookkeeper enters in QuickBooks in five minutes,
   customer statements, deposit-slip-shaped payment batches, and a **soft
   period lock** (ST's graduated Open → Partially closed model is the shape
   to borrow, minus the ceremony). No in-app GL, no live API sync until real
   customers demand it.
2. **Inventory: boring beats big.** The immutable ledger + one-destination
   PO make whole error classes unrepresentable — extend that with the four
   boring features the tenant walk confirmed shops actually get from ST (CSV
   import, vendor master, reorder points/replenishment, partial receipts)
   and skip the rest. Returns-to-vendor with credit tracking earns a place
   on the roadmap behind those four.
3. **Pricebook: import rails, not licensed content.** ST ships base-product
   Excel import/export and monetizes manufacturer content through Pricebook
   Connect. Trade-neutral BellField builds the import/export and bulk-edit
   rails, adds a cost-drift review worklist when receipts move costs, and
   never enters the content-licensing business. **Wire the already-modeled
   agreement price** — member pricing is a first-class field in ST's pricing
   engine and BellField's Phase 6 sold it without delivering it.
4. **Comms: triggered + logged on owned rails.** Booking confirmation,
   reminder, and on-my-way emails ride the receipt-lane blueprint end to end
   (enqueue-in-transaction, retries, owner templates, per-job suppression,
   timeline logging) — table-stakes parity delivered without new
   infrastructure.
5. **Time/GPS: derive, don't surveil — and export, don't rebuild.** ST's
   payroll machinery (labor types, earnings codes, OT rules, legal sign-off
   terms) shows both the value and the weight. BellField's shape: appointment
   statuses techs already tap are the time clock (status-derived durations
   report is free today), structured time entries feed the existing
   labor-cost sink next, GPS last with technician-visible policy — and
   payroll itself stays an export, never an engine.
6. **Tax: stay simple, know the boundary.** ST's model is zip-mapped tax
   zones with separate service/material rates. BellField's single company
   rate + item taxability is the right v1 — but it must actually work (the
   $0-tax bug) and the zone model is the documented growth path if
   multi-jurisdiction shops arrive.
7. **Design: make "simple" true, not claimed.** The five systemic fixes
   (URL-backed navigation + persisted session, three shared primitives, one
   formatter, scoped messages, list pagination) convert an honest-but-rough
   office app into the intuitive product the positioning promises — and they
   are prerequisites for demos, not polish. Density work (hover card + status
   buckets) then adopts ST's best dispatch idea without maps/routing bloat.
8. **Close the sold-but-not-delivered loops.** Two were found: agreement
   member pricing (modeled, never applied) and the printable invoice's
   missing company identity/amount-due. Loops like these cost trust far
   beyond their size; both are small.

## Indicative Rescore (labeled: BellField code-evidenced, not browser-driven)

Against [fsm-comparison-rubric.md](./fsm-comparison-rubric.md) v2, moving
only rows with hard evidence since the 2026-06-12 scorecard. ServiceTitan
absolute stays **98/A** (today's walk reinforced depth). Not an official
scorecard — the next formal pass should browser-drive BellField.

| Row (Pts)                | 06-12 A  |  Now A  | 06-12 B  |  Now B  | Why                                                                                                                             |
| ------------------------ | :------: | :-----: | :------: | :-----: | ------------------------------------------------------------------------------------------------------------------------------- |
| 1 Navigation/IA (5)      |   3.5    |   3.5   |   4.5    |  **4**  | Design audit: no URLs/deep links, F5 logout, back-to-dispatch — fit-for-intent quality issue                                    |
| 9 Estimates (8)          |   3.5    |  **4**  |   4.5    |  **5**  | Acceptance links shipped + live-smoked (the 06-12 caveat resolved); field builder still deferred                                |
| 10 Billing/payments (10) |   3.5    |   3.5   |    5     | **4.5** | Payments moved a lot (links/deposits/refunds/receipts/numbering), but the $0-tax bug is an accounting-safety defect until fixed |
| 13 Comms/documents (4)   |    3     | **3.5** |   4.5    |  **5**  | Invoice email + four receipt slices shipped; operational comms still absent (A stays behind ST's observed breadth)              |
| 14 Reporting/admin (3)   |   3.5    |  **4**  |   4.5    |   4.5   | Accounting-handoff reports + Gates 1–3 proven; owner KPI landing still missing                                                  |
| **Weighted totals**      | **76.8** | **≈78** | **94.6** | **≈94** | Track A grade C; Track B grade A                                                                                                |

Reading: Track A inched up on money delivery; Track B dipped on two honest
findings (the tax bug, the navigation/session foot-guns) that are both
cheap to fix — fixing Tier 0 alone should put Track B at ~96.

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
6. **Customer statements** (M — ST's observed AR Management is the bar:
   customer-level, print/email tracked); **payment terms + due dates** (M —
   observed as standard invoice fields in ST); **accounting handoff v2** —
   income-category snapshot onto lines + journal-summary CSV +
   exported-through marking (M); **soft period lock** (M — ST's graduated
   close validates the shape).

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

**Tier 3 — inventory/catalog second ring (every ST counterpart
tenant-confirmed):**

10. **Catalog + inventory CSV import/export** with dry-run validation +
    catalog pagination (M) — base-product table stakes at ST; the #1
    adoption blocker for parts-heavy shops.
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
    decision; ST bills by membership-type cadence); returns-to-vendor
    movement kind (M); QuickBooks API sync (L, demand-gated); field estimate
    builder (L, already roadmapped).

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

Mid-pass correction (verbatim, after the first attempt used public marketing
pages):

> If service titan wasn't available and you didnt get a real look at the
> product you should have stopped immediately as I dont care about any
> "publicly avaialble" claims or marketing. I'd consider any of those
> comparisons garbage and based on marketing lies. Try chrome on the other
> pc. start over ONLY IF YOU GET INTO SERVICE TITAN.

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

## Appendix C — Evidence Surfaces

**ServiceTitan tenant walk (logged-in, read-only, 2026-07-14):**

- `go.servicetitan.com` Modular Dashboard
- Accounting → Batch/Export Transactions (unbatched invoices workspace + QuickBooks export rail)
- Accounting → Journal Entries
- Accounting → Accounting Periods
- Accounting → AR Management
- Accounting → Bank Deposits
- Accounting → Accounts Payable → Bills
- Accounting → Accounting Audit Trail
- Inventory → Items (Item Overview)
- Inventory → Replenishment
- Inventory → Purchase Orders
- Inventory → Returns
- Inventory nav: Receipts, Adjustments, Transfers, Inventory Counts (sections confirmed)
- Pricebook → Materials
- Pricebook → Price Setup
- Pricebook → Import/Export
- Pricebook → Pricebook Connect → Catalogs
- Pricebook nav: Services, Equipment, Categories, Pricing Builder, Templates, History, Updates (sections confirmed)
- Settings → Payroll (+ Payroll Adjustment Codes)
- Settings → Invoicing → Tax Zones
- Settings → Invoicing → Membership Types

**Struck from this pass per the evidence standard:** all
servicetitan.com marketing/feature-page claims and third-party
pricing/review aggregator content gathered during the rejected first
attempt. None of it is used as evidence anywhere in this document.
