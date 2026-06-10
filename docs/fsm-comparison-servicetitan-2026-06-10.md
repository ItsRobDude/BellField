# BellField vs. ServiceTitan - Scored Comparison (Chrome rerun, 2026-06-10)

Run against [fsm-comparison-rubric.md](./fsm-comparison-rubric.md) v2.

This is the current scorecard after the Catalog, optioned-estimate, estimate PDF delivery,
company Settings, tax-setting, and estimate-editor cleanup passes. It supersedes
[fsm-comparison-servicetitan-2026-06.md](./fsm-comparison-servicetitan-2026-06.md) for
current scoring, while the older file remains useful historical evidence.

## Method And Caveats

- BellField was inspected live in Chrome at `http://127.0.0.1:3000/` as the seeded Owner user.
  Surfaces checked: Dispatch, New Job, Jobs, Customers, Catalog, Agreements, Inventory,
  Purchasing, Bookkeeping, Reports, Employees, Settings, System, job detail tabs, and the
  new estimate builder. No BellField records were saved, posted, emailed, or created for this
  comparison.
- ServiceTitan was inspected live in Chrome in a logged-in tenant at `go.servicetitan.com`.
  Surfaces checked: job detail/chat, Dashboard, Calls/manual booking, Dispatch, Accounting,
  Inventory/Replenishment, Reports, and Pricebook. No ServiceTitan records were submitted or
  saved.
- Public market references were checked to sanity-check the broader "big FSM" feature set:
  [ServiceTitan](https://www.servicetitan.com/),
  [ServiceTitan Pricebook Pro](https://www.servicetitan.com/features/pro/pricebook),
  [Jobber](https://www.getjobber.com/),
  [Housecall Pro pricing/features](https://www.housecallpro.com/pricing/), and
  [FieldEdge field service software](https://fieldedge.com/field-service-software/).
- Field-mobile row 7 is still not directly Chrome-drivable because BellField field-mobile is
  Expo/React Native. BellField field scoring uses source/docs plus
  [field-mobile-smoke.md](./field-mobile-smoke.md).
- Code-evidence rows, especially invoice posting locks and backend permission enforcement,
  were checked from source/docs rather than browser clicks.
- ServiceTitan tenant data was uneven. The scoring uses exposed structure and workflow breadth,
  not private tenant/customer details.

## Headline Result

| Track                                         |  Score | Grade | Reading                                                                                                                                                                       |
| --------------------------------------------- | -----: | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ServiceTitan absolute**                     | **98** | **A** | Still the mature category benchmark: deep dispatch, call booking, customer comms, pricebook/proposals, accounting, reports, field workflow, and commercial integrations.      |
| **BellField Track A: parity vs ServiceTitan** | **76** | **C** | BellField is materially better than the 2026-06-08 run, especially in Catalog, estimate documents, and Settings. It is still behind the market suite on customer-facing flow. |
| **BellField Track B: fit-for-intent**         | **94** | **A** | The chosen core is strong: owner-safe money rules, good job detail, real inventory/job cost, offline field posture, Catalog-backed estimates, and controlled document email.  |

Compared with the 2026-06-08 run:

| Track                 | 2026-06-08 | 2026-06-10 | Movement |
| --------------------- | ---------: | ---------: | -------: |
| ServiceTitan absolute |       98.0 |       98.0 |      0.0 |
| BellField Track A     |       73.0 |       76.1 |     +3.1 |
| BellField Track B     |       92.0 |       93.9 |     +1.9 |

No BellField failure gate tripped. Field offline work is preserved according to current smoke
evidence; posted invoices are locked; history is not casually overwritten; dispatch has the
true-workspace basics; permissions are backend-enforced; and the field app is not a shrunken
office app.

The plain-English read: **BellField is an A core and a C market competitor.** The product is
being built well, but the remaining parity gap is visible to owners because it sits around
customer acceptance, invoice delivery, payments, SMS/on-my-way, routing/GPS, accounting
integrations, and polished reporting.

## Scorecard

Contribution = `(score / 5) * Pts`.

ST = ServiceTitan absolute vs the rubric standard. A = BellField parity vs ServiceTitan.
B = BellField fit-for-intent, scope-adjusted.

| #   | Area (Pts)                                 |   ST   |   A    |   B    | Judgment                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------ | :----: | :----: | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Navigation, speed & IA (5)                 |   4    |  3.5   |  4.5   | BellField remains calmer and easier to scan. ServiceTitan has broader global navigation/search and a mature command-center feel, but with much more visual weight. BellField still lacks richer shortcuts and cross-record search depth.                                                                                                                  |
| 2   | At-a-glance info sufficiency (6)           |  4.5   |  3.5   |   4    | BellField job detail is strong, with clear Where / Who pays / When / work-at-a-glance structure. Dispatch cards still need more visible time, tech, status, job type, and warning flags on the card face.                                                                                                                                                 |
| 3   | Customer/location/contact (8)              |   5    |   4    |   5    | BellField's customer/location/contact model is correct and history-safe. ServiceTitan remains richer on commercial contact context, chat, map/phone/email links, tags, and customer-facing context.                                                                                                                                                       |
| 4   | Equipment & service history (6)            |   5    |   4    |   5    | BellField is strong for current intent: separate equipment records, history, grouping/replacement posture, active/inactive behavior, and field mutation paths. ServiceTitan remains deeper and more mature across trade-specific service context.                                                                                                         |
| 5   | Call booking & intake/lifecycle (8)        |   5    |   4    |  4.5   | BellField's intake shape is good: call details, search/create, optional scheduling, and bill-to separation. The remaining gap is maturity: campaign/business unit/priority depth, booking confirmations, and at-scale typeahead/search behavior.                                                                                                          |
| 6   | Dispatch & scheduling (10)                 |   5    |   4    |  4.5   | BellField passes the real-workspace bar: tech rows, unassigned queue, date controls, reassign/reschedule/status edit, overlap handling, and open job detail. ServiceTitan still wins map, status buckets, capacity/clock context, routing, and polish.                                                                                                    |
| 7   | Field mobile & offline (12)                |   5    |   4    |   5    | BellField's offline model is excellent for current scope: assigned-work cache, durable queue, Sync Now, conflict/rejected preservation, media replay, and truck-stock/Catalog add-work flow. ServiceTitan still wins field selling/payment breadth.                                                                                                       |
| 8   | Notes/activity/media/history (6)           |   5    |   4    |  4.5   | BellField's timeline remains clean and correct, now with delivery events in scope. ServiceTitan's history surface is broader: calls, notes, files, email, chat, SMS reminders, assignments, reschedules, and arrival-style operational events.                                                                                                            |
| 9   | Estimates/pricing/register/draft (8)       |   5    |  3.5   |  4.5   | This is the biggest improvement. BellField now has a trade-neutral Catalog, managed categories, tax defaults, category-first estimate browsing, optioned estimates, sell-side snapshots, PDF export, and estimate email. It still lacks mature pricebook/proposal depth, field estimate building, customer acceptance, and dynamic/member/add-on pricing. |
| 10  | Billing/payments/accounting safety (10)    |   5    |  3.5   |   5    | BellField's accounting safety is excellent: eager draft, posted lock, frozen snapshot, adjustment/credit path, append-only manual payments, amount due derivation, and bookkeeping worklists. ServiceTitan wins breadth: payment processing, batches, accounting exports/integrations, and recurring billing machinery.                                   |
| 11  | Inventory/purchasing/costing (8)           |  4.5   |   4    |  4.5   | BellField has serious inventory/job-cost mechanics: on-hand, weighted-average valuation, movements, truck stock, PO receive, issue-to-job, equipment bridge, and frozen job-cost snapshots. ServiceTitan/FieldEdge-style ecosystems are broader and more polished.                                                                                        |
| 12  | Permissions/audit/safety (7)               |   5    |   4    |   5    | BellField has backend-enforced role templates and employee overrides across important areas. ServiceTitan likely has deeper enterprise policy/admin breadth, but BellField's permission posture is transparent and serious.                                                                                                                               |
| 13  | Customer comms/documents (4)               |   5    |  2.5   |   4    | BellField now has controlled estimate PDF email from `estimates@bellfield.app`, customer-facing template settings, safe delivery history, and audit posture. The big-suite gap remains invoice delivery, customer acceptance, payment links, SMS reminders/on-my-way, opt-outs, and portal behavior.                                                      |
| 14  | Reporting/admin/reliability/deployment (3) |   4    |   3    |   4    | BellField added useful fixed reports, CSV exports, Settings, and a System/support surface. It still needs a practical self-hosted backup/restore/update runbook and broader owner dashboards before this feels commercially complete.                                                                                                                     |
| -   | **Weighted total**                         | **98** | **76** | **94** |                                                                                                                                                                                                                                                                                                                                                           |
| -   | **Grade**                                  | **A**  | **C**  | **A**  |                                                                                                                                                                                                                                                                                                                                                           |

## Weighted Lens Read-Outs

| Lens        | ServiceTitan | BellField Track A | BellField Track B | Reading                                                                                                                                       |
| ----------- | -----------: | ----------------: | ----------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Office UI   |         96.3 |              74.3 |              91.3 | BellField's office core is legitimately good, but major FSM suites still have the surrounding revenue, reporting, and communication machine.  |
| Field UI    |         94.4 |              77.4 |              92.8 | BellField's field/offline foundation is strong; parity losses are mostly field estimates, payment collection, GPS/routing, and selling depth. |
| Correctness |         98.2 |              76.8 |              95.3 | BellField's correctness posture is a strength. The parity gap comes from adjacent controls and integrations, not sloppy core rules.           |

## What Changed Since 2026-06-08

BellField improved most in three places:

- **Row 9, Estimates/pricing/register/draft:** the earlier scorecard called this the biggest gap.
  The new Catalog, managed categories, category-first estimate builder, optioned estimates,
  document export, and estimate delivery moved it from weak to credible.
- **Row 13, Customer comms/documents:** estimate PDF email delivery from
  `estimates@bellfield.app` gives BellField a real first customer-facing document lane.
  The implementation is correctly controlled by BellField rather than shop-managed provider keys.
- **Row 14, Reporting/admin/reliability:** Settings, System/support, accounting reports, sales-tax
  summary, job profitability, inventory valuation, CSV exports, and payment-batch grouping make the
  owner/admin surface more real.

Rows that did not materially move:

- Dispatch is still good, but card density and map/routing/GPS remain gaps.
- Billing safety is still excellent, but online payment and accounting-integration breadth remain gaps.
- Field mobile is still excellent for current scope, but field estimate building and field payment
  collection remain later.

## Broader Market Context

The public pages for Jobber, Housecall Pro, FieldEdge, and ServiceTitan all reinforce the same
common market expectations:

- scheduling/dispatching
- quotes/estimates/proposals
- invoices and payments
- customer communication by text/email
- customer self-service or portal-style actions
- pricebook or visual price presentation
- mobile field workflow
- reports/dashboards
- service agreements or service plans
- accounting/QuickBooks-style integration

BellField does not need to copy every growth-suite feature early. But the customer-facing money
loop is not optional forever. A contractor will feel the gap when an estimate cannot be approved
cleanly, an invoice cannot be sent/paid cleanly, or the office cannot see what still needs money
follow-up.

## Highest-Leverage Recommendations

1. **Complete the customer-facing money loop before adding marketing automation.**
   Next logical slices: estimate acceptance link, invoice delivery, payment links for posted invoices,
   and durable delivery/payment audit rows. Keep the rule: person-triggered, permission-aware,
   logged, not spammy.
2. **Improve dispatch card density.**
   Add visible time window, technician, status badge/text, job type/category, and warning flags to
   the appointment cards before bigger map/routing work.
3. **Add invoice delivery after estimate delivery stabilizes.**
   Estimate delivery proves the pattern. Bookkeeping will feel incomplete until posted invoices can
   be sent professionally and logged.
4. **Plan payment links carefully.**
   Payments affect trust, support, refunds, reconciliation, and security. Keep it online-only, posted
   invoice only, provider-confirmed, and audit-heavy.
5. **Polish owner/reporting surfaces.**
   The reports exist, but owners will expect a tighter "what needs attention" view: open balances,
   unsent estimates, approved-not-scheduled estimates, margin warnings, pending payment batches,
   expiring agreements, and inventory exceptions.
6. **Do the self-hosted runbook work before pilot.**
   Backup/restore/update/log guidance is still a real launch gate. It is not glamorous, but it is
   the difference between a useful product and an unsafe install.

## Bottom Line

BellField is not close to ServiceTitan as a full commercial suite. That is still true after the
recent estimate/Catalog work.

But the improvement is real. BellField is no longer missing the whole estimate/pricing/document
lane; it now has a credible, controlled foundation. The correct next move is not to bolt on spammy
marketing. It is to finish the owner-visible money loop: estimate acceptance, invoice delivery,
payment links, and clean follow-up lists.
