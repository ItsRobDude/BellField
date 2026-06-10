# BellField vs. ServiceTitan — Scored Comparison (Chrome rerun, 2026-06-08)

> Historical snapshot: this comparison predates the later Catalog, service-agreement,
> field Register Add Work, estimate PDF delivery, company Settings, and tax-setting passes.
> Use it as evidence from that Chrome run, not as current BellField scoring.
> Current scoring now lives in
> [fsm-comparison-servicetitan-2026-06-10.md](./fsm-comparison-servicetitan-2026-06-10.md).

Run against [fsm-comparison-rubric.md](./fsm-comparison-rubric.md) v2 after the
weighting/Track A/Track B adjustments. Both office products were inspected live in Chrome:
BellField at `localhost:3000` and a logged-in ServiceTitan tenant at `go.servicetitan.com`.

This pass is intentionally more judgmental than the first one, with side notes on cosmetic
feel, information density, and whether the screens feel like finished commercial software.

## Method And Caveats

- BellField was inspected live in Chrome on Dispatch, Job detail, New job, Inventory,
  Purchasing, Bookkeeping, Reports, Employees, and job invoice/cost/timeline tabs.
- ServiceTitan was inspected live in Chrome on Dashboard, Dispatch, Calls/manual booking,
  Job detail, Accounting, Inventory/Replenishment, Reports, and Pricebook.
- No ServiceTitan records were saved or submitted. Forms were observed only.
- Field mobile row 7 is not directly Chrome-drivable for BellField because it is Expo/React
  Native. BellField field scoring uses the recorded hardware smoke evidence in
  [field-mobile-smoke.md](./field-mobile-smoke.md) plus source/code posture.
- Code-evidence rows, especially invoice posting locks and permission enforcement, cannot be
  proven by clicking. BellField is scored from source and docs; ServiceTitan is scored from
  observed product behavior plus the tenant's exposed surfaces.
- ServiceTitan tenant data was uneven: some areas had real/seeded rows, while others were
  empty or near-empty. Breadth and structure were still visible.

## Headline Result

| Track                                         |  Score | Grade  | Reading                                                                                                                                                                                                                |
| --------------------------------------------- | -----: | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ServiceTitan absolute**                     | **98** | **A**  | It is the mature category product. Deep, broad, operationally battle-tested, and very strong in pricebook, calls, reports, accounting, notifications, and commercial breadth.                                          |
| **BellField Track A: parity vs ServiceTitan** | **73** | **C**  | BellField is credible but clearly behind the market leader on breadth and polish. The gap is not subtle once pricebook, customer comms, report library, accounting integrations, and membership machinery are counted. |
| **BellField Track B: fit-for-intent**         | **92** | **A-** | BellField's chosen core is genuinely good: clean dispatch, strong job screen, disciplined billing safety, real inventory/job cost, offline-first field model, and backend permission posture.                          |

No BellField failure gate tripped. Field offline work is preserved according to the recorded
hardware smoke; posted invoices are locked; history is not casually overwritten; dispatch has
the true-workspace basics; permissions are backend-enforced; and the field app is not a
shrunken office app.

The harsher conclusion: **BellField is an A- foundation and a C market competitor.** That is
not a contradiction. It means the operational core is being built well, but ServiceTitan is
years ahead in revenue-suite breadth.

## Scorecard

Contribution = `(score / 5) * Pts`.

ST = ServiceTitan absolute vs the rubric standard. A = BellField parity vs ServiceTitan.
B = BellField fit-for-intent, scope-adjusted.

| #   |                                 Area (Pts) |   ST   |   A    |   B    | Judgment                                                                                                                                                                                                                                                                                                                                |
| --- | -----------------------------------------: | :----: | :----: | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |                 Navigation, speed & IA (5) |   4    |  3.5   |  4.5   | BellField is faster and calmer. ServiceTitan is more powerful but heavier, with global search, many modules, classic/new layout split, and a lot of chrome. BellField lacks the premium cockpit feel and richer shortcuts.                                                                                                              |
| 2   |           At-a-glance info sufficiency (6) |  4.5   |  3.5   |   4    | BellField job detail is strong: What / Where / Who pays / When plus counters. Dispatch cards are too sparse: status is semantically present but not prominent, and the card face lacks time/tech/flags. ServiceTitan shows more, sometimes too much.                                                                                    |
| 3   |              Customer/location/contact (8) |   5    |   4    |   5    | BellField's model is correct and history-safe. ServiceTitan feels more commercially complete: phone/email/chat/map links, customer/location depth, tags, notifications, and richer contact context.                                                                                                                                     |
| 4   |            Equipment & service history (6) |   5    |   4    |   5    | BellField is close on model quality: separate assets, equipment history, filters, pending/active/inactive, replacement/grouping posture. ServiceTitan has deeper mature trade context and recurring service surface.                                                                                                                    |
| 5   |        Call booking & intake/lifecycle (8) |   5    |   4    |  4.5   | BellField's intake is structurally good: single-screen search/create + call details + schedule + bill-to override. ServiceTitan's Calls/manual job screen is deeper: job type, business unit, marketing campaign, priority, booking confirmation, invoice signature, build estimate, tags.                                              |
| 6   |                 Dispatch & scheduling (10) |   5    |   4    |  4.5   | BellField passes daily dispatch: tech rows, unassigned, reschedule, reassign, status changes, overlap lanes, open job. ServiceTitan adds map, status buckets, scheduled/unconfirmed/future counts, clock-in/capacity context, configuration, and a more mature operations board.                                                        |
| 7   |                Field mobile & offline (12) |   5    |   4    |   5    | BellField's offline model is excellent for current scope: assigned-work cache, durable queue, conflict/rejected preservation, media replay, Sync Now, truck-stock auto-costing. ServiceTitan still wins breadth with mature mobile selling/field workflows.                                                                             |
| 8   |           Notes/activity/media/history (6) |   5    |   4    |  4.5   | BellField's unified timeline is correct and readable. ServiceTitan job history is richer: events, calls, notes, files, email, chat, SMS reminders, GPS arrival, assignments, reschedules, timesheets. BellField is cleaner; ServiceTitan is deeper.                                                                                     |
| 9   |       Estimates/pricing/register/draft (8) |   5    |  2.5   |   4    | In this historical run, this was BellField's biggest parity miss: ServiceTitan Pricebook had services, categories, codes, descriptions, hours, dynamic/static/member/add-on pricing, material cost, income account, and mobile view. BellField later shipped Catalog/service-agreement work, so this row must be rescored before reuse. |
| 10  |    Billing/payments/accounting safety (10) |   5    |  3.5   |   5    | BellField's safety design is excellent: posted lock, frozen snapshot, adjustment/credit path, append-only payments, derived amount due. ServiceTitan crushes breadth: accounting batches, collect payments, charge interest, recurring billing, export/reconciliation workflows.                                                        |
| 11  |           Inventory/purchasing/costing (8) |  4.5   |   4    |  4.5   | BellField has real inventory: on-hand, weighted average valuation, movement ledger, trucks, issue-to-job, PO receive, equipment bridge, job-cost snapshot. Cosmetic feel is admin-table-ish. ServiceTitan has replenishment/vendor/reporting ecosystem but the observed inventory page was not as compelling as pricebook/accounting.   |
| 12  |               Permissions/audit/safety (7) |   5    |   4    |   5    | BellField's role templates and employee overrides are serious and backend-enforced. ServiceTitan likely has richer enterprise role/policy depth. BellField is more transparent and simpler.                                                                                                                                             |
| 13  |               Customer comms/documents (4) |   5    |   1    |   3    | ServiceTitan wins hard: reminders, SMS history, job notifications, booking confirmation, customer-facing comms, document/payment ecosystem. BellField has deferred most of this, so Track B is not destroyed, but market parity is poor.                                                                                                |
| 14  | Reporting/admin/reliability/deployment (3) |   4    |  2.5   |  3.5   | ServiceTitan's report library is huge: AR, deposits, invoices, inventory, memberships, marketing, productivity, reconciliation, custom reports. BellField has useful fixed reports and self-hosted advantages, but its operator/runbook/reporting surface is immature.                                                                  |
| —   |                         **Weighted total** | **98** | **73** | **92** |                                                                                                                                                                                                                                                                                                                                         |
| —   |                                  **Grade** | **A**  | **C**  | **A-** |                                                                                                                                                                                                                                                                                                                                         |

## Weighted Lens Read-Outs

| Lens        | ServiceTitan | BellField Track A | BellField Track B | Reading                                                                                                                                            |
| ----------- | -----------: | ----------------: | ----------------: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Office UI   |         96.3 |              70.5 |              89.0 | BellField office screens are good for current scope, but ServiceTitan's breadth makes it feel like a complete business operating system.           |
| Field UI    |         94.4 |              77.4 |              92.8 | BellField's field/offline core is strong; it loses parity on field selling, pricebook, payment/customer comms breadth.                             |
| Correctness |         98.2 |              74.3 |              93.8 | BellField's correctness posture is excellent; parity dips because ServiceTitan carries more mature adjacent controls and audit/reporting surfaces. |

## Cosmetic And Feel Notes

### BellField Feel

BellField feels calm, disciplined, and readable. It avoids the enterprise pile-up problem.
The job detail page is the best screen: it immediately answers the right operational
questions without making the user hunt.

The downside is that several surfaces still feel like a serious internal tool rather than
commercial software:

- The left nav is efficient but visually plain and all-text. It does not yet feel like a
  polished operations cockpit.
- Dispatch cards are too minimal. They need visible time/status/technician/flags on the card
  face, not just in positioning or accessible label.
- Smoke-data strings and long IDs make Inventory/Purchasing look much uglier than the actual
  feature quality deserves.
- Inventory is functionally strong but visually table-heavy. It needs better hierarchy:
  "what needs action," "what is on hand," "recent movement audit," and "configure catalog"
  should not all feel equal.
- Bookkeeping is correct but empty-state dominated in this tenant. It needs a richer
  day-to-day review feel once real invoices exist.
- Some async transitions briefly look stuck, for example selecting a location in New Job or
  opening Invoice/Job Cost tabs before they finish loading.
- Accessibility/debug smell: duplicate accessible names made the nav harder to target than it
  should be.

BellField's visual identity is "boring and trustworthy." That is good. But the product needs
more visual confidence before it feels like something a shop owner would pay for next to a
market leader.

### ServiceTitan Feel

ServiceTitan feels like a machine that has absorbed years of field-service edge cases. The
screens are full of business nouns that matter: campaign, business unit, invoice signature,
recurring service, timesheets, job notifications, AR reconciliation, replenishment, member
pricing, income accounts.

The downside is cognitive weight:

- It is busy. There is a lot of chrome, iconography, toggles, submenus, and glyph noise.
- The "Use Classic Layout" affordance hints at product-era layering.
- The DOM and accessibility snapshot are messy, with many icon-font artifacts and unnamed
  buttons. The product is powerful, but not clean.
- Dashboard and reports can feel like a wall of metrics. Great for managers, intimidating for
  a small shop.
- Dispatch is clearly superior on tools, but it is a denser workbench than BellField's board.

ServiceTitan's visual identity is "enterprise command center." It wins maturity. BellField can
beat it on calmness, but not yet on commercial polish or breadth.

## Priority-Specific Judgment

### Dispatch

BellField is good enough for a v1 shop day-view. It is not embarrassing. It has real scheduling
operations: reassign, reschedule, status change, unassigned area, overlap handling, open-job
from card. That clears the serious-workspace bar.

But ServiceTitan still wins. It has map context, status buckets, capacity/clock-in context,
future/hold/paused counts, board configuration, and a more complete visual command center.

Most cost-effective BellField improvement: **fix dispatch card density first**. Add visible
time window, tech, status text/badge, job type, and warning flags. Do this before map/week
view. The board already works; the cards need to talk.

### Call Booking

BellField's intake is well-conceived and small-shop friendly. It lets the office start with
the call problem, find/create the customer/location, schedule or leave unscheduled, and keep
bill-to separate from owner. That is exactly the right shape.

ServiceTitan is deeper: campaign, business unit, priority, booking confirmation, invoice
signature, tags, build estimate, map/property hooks. BellField should not copy all of that
early, but campaign/source and customer notification posture are the obvious later gaps.

### Job Detail

BellField's job overview is legitimately strong. The What / Where / Who pays / When layout is
cleaner than ServiceTitan's more sprawling job page.

ServiceTitan wins depth: tags, SMS/call history, recurring service events, job notifications,
timesheets, invoice signature, richer service/bill-to contact blocks. BellField should preserve
its cleaner job page, but add richer side/context modules carefully.

### Notes And Activity

BellField has the right unified-history instinct. ServiceTitan shows what the mature version
becomes: calls, notes, files, email, chat, SMS reminders, GPS arrivals, assignments, and
reschedules all threaded into history filters.

BellField needs better timeline filtering and communication-event types later. The current
timeline is clean but comparatively thin.

### Inventory And Purchasing

BellField is much stronger here than the cosmetic surface suggests. The ledger/valuation/job
cost mechanics are serious. But the UI feels like rows from a validation harness.

ServiceTitan's inventory area did not look as impressive as its pricebook/accounting in this
tenant, but its reporting/replenishment/vendor ecosystem is clearly broader. BellField should
improve presentation before adding more logic: action summaries, cleaner names, compact
movement audit, and better separation of catalog/location/on-hand workflows.

### Bookkeeping And Accounting

BellField's accounting safety may be better designed than many commercial systems: posted
lock, frozen meaning, adjustment/credit corrections, append-only payments, derived balance.
That is a real strength.

ServiceTitan destroys BellField on breadth: accounting batches, export/reconciliation, collect
payments, recurring billing, charge interest, invoice lists with real operational filters. If
BellField wants market parity, QuickBooks/export/reconciliation and document delivery/payment
capture become unavoidable later.

## Highest-Leverage Gaps

1. **Pricebook / flat-rate catalog maturity** — still a major market gap in this
   historical run. BellField later shipped a trade-neutral Catalog, but ServiceTitan's
   pricebook remains a deeper sales system.
2. **Customer communications** — booking confirmation, on-my-way/reminders, SMS/email history,
   invoice/estimate delivery. BellField currently loses this category badly.
3. **Dispatch card density** — cheap, high-impact polish. The board works; the cards are too
   quiet.
4. **Commercial reporting breadth** — BellField reports are useful but tiny next to
   ServiceTitan's library.
5. **Accounting integration/export/payment breadth** — BellField has safety; ServiceTitan has
   the surrounding bookkeeping machine.
6. **Memberships / recurring service agreements** — ServiceTitan repeatedly exposes this in
   reports, pricebook/services, recurring service, and billing. BellField later shipped a
   service-agreement lifecycle, but recurring automation and billing remain later work.
7. **Visual polish on table-heavy screens** — Inventory/Purchasing/Bookkeeping need product
   design attention so they look as strong as their underlying models.

## Brutal Bottom Line

BellField is not close to ServiceTitan as a full FSM suite. Anyone pretending otherwise is
grading only the slices BellField has chosen to build.

But BellField is also not a toy. The core record model, dispatch foundation, job detail,
invoice safety, permissions, inventory ledger, job costing, and field offline posture are
legitimately solid. The strongest criticism is not "this is wrong"; it is "this is narrower
and visually less commercial than the market leader."

The next product-design win is not a giant new feature. It is making the existing operational
surfaces feel more decisively professional:

- denser dispatch cards,
- cleaner inventory/purchasing presentation,
- richer timeline filters,
- better empty/loading states,
- and less smoke-data ugliness in demos.

After that, the strategic parity decision is pricebook/customer communications. Those are the
features that most clearly separate a trustworthy internal platform from a major FSM competitor.
