# ServiceTitan Deep-Systems Comparison — 2026-07-14 Codex Pass

## Provenance

- **Pass ID:** `BF-COMP-ST-2026-07-14-CODEX-01`
- **Date:** July 14, 2026 (`America/Los_Angeles`)
- **Lead researcher and author:** OpenAI Codex, primary agent `/root`
- **Parallel researchers:** OpenAI Codex sub-agents `/root/accounting_deep_pass`, `/root/inventory_ops_deep_pass`, and `/root/ux_architecture_deep_pass`
- **Method:** read-only inspection of the current BellField repository, a logged-in ServiceTitan tenant through the user-requested Chrome control skill, and current official ServiceTitan material
- **Mutation policy:** no ServiceTitan records were created, edited, exported, posted, or deleted
- **Privacy policy:** this report records workflow structure, not tenant customer, employee, financial, address, phone, or transaction details
- **Authorship guard:** this is an OpenAI Codex research artifact. It is not a Claude or Anthropic pass and must not be attributed to an unrecorded agent.

The [competitive research log](./competitive-research-log.md) is the provenance registry for this and future passes.

## Why this pass exists

The June 12 scorecard was useful at the time, but it predates shipped acceptance links, invoice delivery, durable invoice numbering, customer deposits, payment links, refunds, and receipts. Its `77/100` parity score and `95/100` fit-for-intent score remain a historical snapshot, not a current score.

This pass does not manufacture a replacement number from a stale rubric. It asks a deeper question: after the visible send-and-pay gaps narrowed, what operational systems still determine whether a small shop can trust BellField every day and at month-end?

## Executive conclusion

BellField's next competitive gap is not a larger feature menu. It is a clearer trust-and-exception layer around the strong records it already has.

The product has unusually good foundations for its maturity: posted invoice snapshots, adjustment records, append-oriented money history, immutable inventory movements, weighted-average cost, final job-cost snapshots, offline-safe captured work, and customer-owned deployment. Those are harder to retrofit than dashboards.

ServiceTitan remains materially ahead in controller and inventory-operator workflows:

- review, post, export, correct, reconcile, and close as explicit states;
- true receivable dates, collections work, statements, deposits, and settlement handling;
- purchase orders, partial receipts, returns, counts, replenishment, and truck custody as connected lifecycles;
- saved, filterable worklists for unsold work and other operational exceptions;
- report discovery and broad operational dimensions.

BellField can do better by making those workflows smaller and more legible. The best target is not an enterprise ERP imitation. It is a calm, role-aware `Money Desk`, an inventory exception center, trustworthy as-of reports, and narrow action queues that explain what needs attention and why.

## Evidence states

- **Confirmed:** present in current BellField code/docs or directly observed in the ServiceTitan tenant.
- **Documented direction:** stated in BellField product or milestone docs but not confirmed shipped.
- **Proposed:** recommendation from this pass; it is not approved product behavior or implementation order.
- **Inference:** a conclusion drawn from confirmed structure, called out where material.

## Direct observation: what the mature system exposes

### Accounting is a state machine, not a report page

The observed ServiceTitan Accounting area combined filters, aggregate paid/tax/revenue/balance figures, collection and recurring-billing actions, an unbatched work queue, and durable batches. A batch could contain invoices, payments, vendor bills, inventory transfers, inventory adjustments, and inventory returns. Export status distinguished fully successful from partially exported work and exposed an error report.

The important lesson is not the number of tables. Accounting handoff has durable membership, explicit state, exceptions, and recovery. BellField's current `Payment batches` are received-date/method groupings, not bank deposits, processor payouts, or export batches. That label currently promises more control than the record supplies.

### Inventory is several operational lifecycles

The observed Inventory area separated:

- items and truck/warehouse locations;
- replenishment with source, available quantity, requested quantity, unit cost, and total cost;
- purchase orders with pending, sent, partially received, received, and canceled states;
- receipts;
- returns with pending, returned, credit-received, and canceled states;
- transfers with pending, picked, received, and canceled states;
- adjustments;
- counts with pending, in-progress, review, completed, and canceled states.

BellField already has the safer core ledger: immutable receive, issue, transfer, adjustment, return, and job-cost effects. The missing layer is human custody and exception control around that ledger.

### Follow-up and tasks are durable work, not dashboard decoration

ServiceTitan's observed Unsold Estimates page was a filterable worklist with created/completion dates, next follow-up, last follow-up, status, responsible people, estimate values, and customer context. Its generic Tasks area added priority, due date, reporter, assignee, status, and resolution.

BellField needs the first pattern more than the second. A narrow, typed action queue for unsold estimates, unresolved captured work, posting warnings, stock discrepancies, failed deliveries, and failed exports is useful. A generic company-wide task manager risks becoming an unmaintainable second source of truth.

### Reports are discoverable, but breadth can become noise

The observed Reports area supported search, categories, templates, created-by filtering, recent reports, card/list views, creation, scheduling, and per-report actions. The dashboard exposed a large KPI catalog spanning revenue, trends, sales, averages, calls, booking, conversion, customer satisfaction, cancellations, memberships, marketing, and technician scorecards.

This breadth is competitive for mature organizations, but it also demonstrates the design debt BellField should avoid: a wall of metrics makes the user interpret the system. A BellField owner landing should instead answer `What needs attention?`, `What changed?`, and `Where can I act?`, with every number drilling into its source list.

### Dispatch density is powerful and expensive

The observed dispatch board combined a technician timeline, clock-in context, dense appointment cards, status buckets, an unassigned-jobs grid with per-column filters, and a map. It is capable, but visually and cognitively expensive. An expanded unrelated module menu also remained visible while dispatch was active, consuming space and attention.

BellField should preserve a calmer board and add density progressively: saved filters, a compact mode, exception chips, and detail-on-demand. It should not treat maximum simultaneous information as expert usability.

## What BellField should protect

These are competitive assets, not temporary scaffolding:

1. **Financial immutability.** Posted invoices lock, later corrections use adjustments, and payments/refunds are append-oriented.
2. **Inventory truth.** Stock changes use immutable movements, weighted-average valuation, and negative-stock protection.
3. **Offline work preservation.** A stale or short truck-part reference does not destroy captured work; it can become an office resolution item without double issuing stock.
4. **Catalog/inventory separation.** What is sold and what is stocked are distinct records with an optional link. Preserve that domain distinction while making the relationship clearer in UI.
5. **Customer-owned deployment.** Small shops can own their data without giving up browser and mobile workflows.
6. **Prompt-driven workflow.** Version 1 can warn and explain instead of copying enterprise lock-everything behavior.
7. **No fake general ledger.** External accounting remains the ledger of record; BellField should own operational truth and a reliable handoff.
8. **Job-context hierarchy.** The current job Overview's `What / Where / Who pays / When` disclosure is a sound small-shop pattern.
9. **Improving dispatch cards.** Status, type, address, summary, review, and overlap cues have materially improved since the June pass without copying ServiceTitan's maximum density.

## Deep gap map

| System                | BellField now                                                                       | Deeper gap                                                                                                                                                                                     | Better BellField target                                                                                | Priority |
| --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Invoice readiness     | A draft with an active line can enter `Ready to post`                               | No explainable evaluation of unfinished/future work, unsynced field changes, unresolved costs, accepted estimates, deposits, terms, tax, or suspicious margins                                 | One readiness explanation with warnings, evidence links, and permissioned override reasons             | P0/P1    |
| Receivables           | Open balance and an approximate aging report                                        | No invoice terms/due date, allocation-aware aging, as-of date, collection state, statements, disputes, or next action                                                                          | Due-date/as-of AR plus a small collection worklist and visible unapplied credit/deposit                | P0/P1    |
| Payment groups        | Read-only groups by received date and method                                        | No durable deposit/payout identity, locked membership, slip/settlement total, or reconciliation                                                                                                | Rename current view, then add separate bank-deposit and processor-payout records                       | P0/P1    |
| Accounting export     | Fixed CSV reports                                                                   | No mapping snapshot, export batch, idempotency, per-row result, retry state, or acknowledgement                                                                                                | Transparent CSV/general-journal handoff with durable export runs and errors before native integrations | P0/P1    |
| Close control         | Posted invoice locks individual records                                             | No close-through date, reopen reason, or cross-transaction exception check                                                                                                                     | A guided operational close by transaction type; still not a GL period engine                           | P1       |
| Historical reporting  | Useful fixed reports and CSVs                                                       | Several reports join live customer/job data; no general as-of/date filters                                                                                                                     | Posted snapshots as display truth, date/as-of filters, and regression tests across later edits         | P0       |
| Tax                   | Default taxable setting/rate and all-time tax-by-rate summary                       | No period, jurisdiction, exemption evidence, sourcing, or filing reconciliation                                                                                                                | Clearly label operational summary; add needed dimensions only for supported tax scope                  | P0/P2    |
| Purchase lifecycle    | PO creation, ordering, one receive action, job/inventory receipt effects            | The form accepts actual quantity, but the repository processes every line and closes the PO; no cumulative receipt/backorder, correction, return/vendor credit, bill match, or exception queue | Ordered, prior-received, this-receipt, and remaining quantity → returns/credits → accounting export    | P0/P2    |
| Stock availability    | On-hand quantities and immutable movements                                          | No reserved/on-hold/on-order/available distinction, min/max, lead time, or replenishment queue                                                                                                 | Explainable availability and suggested replenishment with operator approval                            | P1       |
| Truck custody         | Locations and direct transfers                                                      | No pick/receive custody states or overdue transfer exception                                                                                                                                   | Optional simple direct transfer for trusted shops; pick/receive when custody needs proof               | P1/P2    |
| Equipment custody     | Received equipment can enter stock with a copied location label and optional serial | Mutable text does not provide stable custody identity; duplicate-serial policy is undefined                                                                                                    | Stable location/item/receipt provenance plus an explicit serial-uniqueness policy                      | P0/P2    |
| Physical counts       | Adjustments can correct stock                                                       | No count session, assignment, blind count, variance review, or approval                                                                                                                        | Small cycle-count sessions with variance evidence and immutable adjustment output                      | P1/P2    |
| Inventory scale       | Complete item/location lists and recent movement list                               | Unbounded item/location reads and a capped movement feed will age poorly                                                                                                                       | Server search, paging, saved filters, and exception-first landing before large catalogs                | P0/P1    |
| Job cost close        | Provisional and final job-cost views                                                | Late cost can require reopening operational job state                                                                                                                                          | Separate operational close from permissioned cost revision history                                     | P1/P2    |
| Agreement accounting  | Agreement records and visit obligations; no automatic job/invoice                   | No billing-run ledger, idempotency, failure queue, or deferred-revenue event model                                                                                                             | Build obligation/event ledger before recurring billing; export recognition to accounting               | P3       |
| Commissions/payroll   | Employee identities and operational attribution                                     | No locked attribution, eligibility trigger, splits, clawbacks, burdened rate, or pay period                                                                                                    | Preview/export only after attribution snapshots; do not build payroll                                  | P3       |
| Follow-up             | Estimates and operational records are navigable                                     | No durable unsold-estimate or exception worklist                                                                                                                                               | Typed queues with owner, next action, due/snooze, reason, and resolution                               | P1       |
| Reporting             | Fixed operational reports and CSV downloads                                         | All-time/current-state semantics, limited filters, no saved view or scheduled delivery                                                                                                         | Fewer trustworthy reports first; then saved views and scheduled exports                                | P0/P2    |
| Role experience       | Permission-aware surfaces                                                           | Same broad workspace and density for many roles                                                                                                                                                | Role defaults and progressive disclosure without using hidden UI as security                           | P1       |
| Navigation safety     | Active view and selection live in component memory                                  | Reload/back/share lose context; rail navigation can bypass a draft guard; default Dispatch can strand a user without Dispatch permission                                                       | URL-addressable views, remembered origin, one dirty-form guard, and first-authorized-view startup      | P0       |
| Item-master UX        | Sell-side Catalog and stock-side Inventory Item are separate and optionally linked  | `Catalog` plus an Inventory `Items` panel makes a valid domain distinction look like duplication                                                                                               | Rename the stock panel, show linked/unlinked state on both sides, and add a reconciliation queue       | P1       |
| Cross-module feedback | Shell-level notice/error state and background Dispatch refresh                      | A Dispatch refresh error can appear while a user works in Bookkeeping or Reports                                                                                                               | Source-scoped feedback with a separate system-health queue                                             | P0/P1    |
| Accessibility/layout  | Inline style objects and partial tab semantics                                      | Inconsistent focus, hover, disabled, alert, responsive, menu-focus, and keyboard behavior                                                                                                      | Small shared primitives and explicit keyboard/focus/responsive acceptance checks                       | P1/P2    |
| Localization          | Language choice is exposed at sign-in                                               | Office operations remain hardcoded English/USD and locale is not passed through                                                                                                                | Complete locale propagation or stop implying product-wide localization                                 | P1       |

## BellField is already shooting itself in the foot in a few places

### 1. Partial-receipt UI implies truth the backend does not preserve

The purchasing form asks for actual received quantity, but the repository processes the submitted PO lines and marks the purchase order received. It does not preserve cumulative received quantity, remaining quantity, skipped/backordered lines, or an intentional close-remainder reason. A partial vendor shipment can therefore look captured while the open obligation disappears. Repair this before broadening purchasing.

### 2. Historical money can inherit today's names

Confirmed code paths in `apps/api/src/modules/bookkeeping/open-balance-query.ts` and `apps/api/src/modules/reporting/reporting.service.ts` join financial output to current customer/job records. A rename, archive, or deletion can therefore change or break historical presentation. Posted snapshots should be display truth; current records should be optional navigation targets.

### 3. `AR aging` overstates its semantics

The current report nets job-level invoices and payments and places the balance in an age bucket based on an old posting date. It is not invoice-due-date, allocation-aware, or as-of aging. Relabel it immediately or add the missing semantics before bookkeepers treat it as accounting evidence.

### 4. Export files omit the identifier humans reconcile

The posted-invoice and payment CSV definitions expose internal invoice IDs but not the shipped durable human invoice number. They also lack date/as-of parameters. This makes a technically correct export needlessly difficult to reconcile outside BellField.

### 5. Accounting mappings can drift after the sale

Catalog items have income category and export code fields, but the posted line snapshot does not preserve the effective mapping. A future export that consults the current catalog could reclassify history after an item edit. Snapshot the effective classification and mapping version when posting.

### 6. Navigation loses the user's working context

The office shell keeps the active view in component state rather than a durable route. Reloads and shared links cannot restore the workspace. Job detail always returns to Dispatch even when the user arrived from Jobs, a customer, history, inventory, purchasing, bookkeeping, or reports. An estimate-draft guard protects some tab changes, but rail navigation can bypass it and unmount the editor. Fix origin-aware return, durable URL state, and a centralized dirty-work guard before adding more modules.

### 7. The information architecture is becoming a flat module list

The office rail exposes a long list of peer destinations while the central workspace shell and job detail panel have grown beyond the repository's preferred review size. This is an early warning for a god-shell architecture and inconsistent cross-module behavior. Group navigation by work intent, extract route/workspace state, and keep domain surfaces focused.

### 8. Inventory is ledger-first but not operator-first

On hand, items, locations, and recent movements receive similar visual weight. The person responsible for stock usually needs exceptions first: low stock, overdue counts, partial receipts, backorders, unresolved job costs, and stale truck sync. Preserve the ledger; change the landing hierarchy.

### 9. Equipment custody relies on mutable text

Received equipment currently copies an inventory-location label and allows a missing serial. That is not a durable custody relationship: location renames can detach meaning, serial transfer/reservation cannot rely on a stable identity, and duplicate-serial behavior is not defined. Add stable inventory-location and receipt/item provenance before expanding serialized stock.

### 10. Broad permissions weaken otherwise strong audit history

The same broad inventory edit capability covers adjustments, transfers, and issues; the same purchasing edit capability covers ordering and receiving. Immutable movements help after the fact, but optional reasons and no stage/threshold separation make preventable mistakes and shrink harder to control. Keep role templates simple while allowing receive, approve, adjust, count, and variance-approval separation when enabled.

### 11. Current reports are snapshots, not a reporting system

The reporting contract explicitly describes current-state snapshots, and endpoints do not accept a general report period. Useful first reports have accumulated without a shared date/as-of/filter model. Adding more cards before fixing semantics would increase false confidence.

### 12. Product documents are drifting behind shipped reality

The comparison rubric still treats acceptance, invoice PDF/email, and a payment gateway as deferred even though those paths have shipped. The screen specification disagrees with itself about whether Dispatch or Dashboard is the default. Some planning status also lags delivered work. This can cause both agents and humans to solve the wrong gap.

### 13. Hard-delete language conflicts with financial invariants

Product documentation broadly allows privileged true deletion while accounting records are intended to be authoritative and immutable. Posted invoices, payments, refunds, deposits, inventory movements, job-cost snapshots, and export batches should be reversed, voided, or privacy-redacted—not casually hard-deleted.

### 14. Permission customization can strand a valid office user

The office workspace initializes on Dispatch and blocks the shell while Dispatch data is absent. The rail also renders several destinations without matching view/create gates even though per-employee permission overrides can revoke Dispatch access. Backend enforcement still protects data, but a legitimate bookkeeping/report-only employee can be left at a permanent `Dispatch is not ready` state. Start on the first authorized role default and load only the active surface.

### 15. Global feedback leaks between modules

The background Dispatch refresh writes into shell-wide error state, so a Dispatch failure can appear while Bookkeeping or Reports are otherwise healthy. Notices can also survive navigation. Scope feedback to the operation that produced it; reserve a separate system-health area for cross-module problems.

### 16. The UI foundation is not keeping pace with product depth

Inline style objects make focus-visible, hover, disabled, alert, responsive, and lifecycle-state behavior inconsistent. Some reports implement partial ARIA tabs while job tabs remain ordinary buttons; menus do not consistently manage initial/return focus; the permanent rail and fixed grids have little breakpoint behavior. A small internal primitive set is enough—no heavy UI dependency is required.

### 17. Language choice currently overpromises

English and Spanish appear at sign-in, but the selected locale is not carried into the office workspace, where operations copy and USD formatting remain hardcoded. Either complete locale propagation and central formatting or stop presenting the choice as product-wide behavior.

## Recommended sequence

This sequence is a research recommendation. The milestone plan still controls implementation order.

### P0 — Make existing truth honest

1. Use posted snapshots for historical financial presentation and add rename/archive regression tests.
2. Implement cumulative PO-line receiving with partial state, remaining quantity, backorder/close-remainder reason, and over-receipt warning or permission.
3. Add stable inventory-location, item, and receipt provenance to stocked equipment and define serial uniqueness.
4. Relabel or rebuild AR aging with invoice date, terms, due date, allocations, and as-of semantics.
5. Add date/as-of filters and durable invoice numbers to financial CSVs.
6. Snapshot accounting/export classification on posted invoice lines.
7. Rename current payment batches to `Suggested payment groups` until durable reconciliation records exist.
8. Resolve the hard-delete and default-screen documentation contradictions.
9. Make startup permission-aware and load the first authorized role default.
10. Give office views durable URLs, return job detail to its actual origin, and centralize unsaved-work navigation guards.
11. Scope errors/notices to their source and remove the incomplete product-wide localization promise or complete its propagation.
12. Add server search/paging before item, location, customer, and transaction lists become too large.

### P1 — Build two calm workbenches

Create a role-aware `Money Desk` with progressive tabs:

- Needs review
- Receivables
- Deposits and payouts
- Export and errors
- Close

Create an inventory action center with:

- Low stock and suggested replenishment
- Open/partial purchase orders and backorders
- Transfers awaiting pick or receipt
- Counts due and variances needing review
- Returns/vendor credits outstanding
- Captured-work cost or truck-sync exceptions

Normal days should remain simple. Batch detail, mapping evidence, approval history, and audit detail should appear only when needed.

Add lightweight shared primitives for `Button`, `Tabs`, `StatusBadge`, `DataTable`, `EmptyState`, `InlineAlert`, and contextual confirmation. Each should own focus-visible, keyboard, disabled, error, and responsive behavior. Add a compact command/search surface for customer, location, job, invoice, phone, and equipment serial so expert speed does not require a denser default UI.

### P2 — Complete operational control, not ERP breadth

- Add partial receipts, receipt correction, returns, vendor credits, preferred vendor, lead time, min/max, and units of measure.
- Add count sessions, reservations/holds where demand proves them, and as-of valuation.
- Separate operational job closure from later cost revisions.
- Add customer statements, collection next actions, and reliable scheduled exports.
- Add saved report/worklist filters and owner/role defaults.
- Rename the Inventory `Items` panel to `Stock items`, expose its Catalog linkage, and provide duplicate/unlinked reconciliation without merging the two domain records.
- Treat serial, lot, warranty, core-charge, and substitution/supersession support as demand-led capabilities, not mandatory fields for every trade.

### P3 — Add advanced accounting dependencies in order

- Agreement obligation/event ledger before automatic billing.
- Idempotent previewable billing runs before deferred-revenue export.
- Locked attribution and cost snapshots before commission preview/export.
- Optional branches/business units hidden by default; one legal entity per BellField installation.

## Deliberate non-goals

Do not close the competitive gap by building:

- a general ledger;
- payroll processing;
- broad AP bill payment before PO/receipt/vendor-credit truth is reliable;
- an unrestricted custom report builder before fixed reports have date/as-of semantics;
- a generic task-management platform;
- marketing automation or routing optimization ahead of operational exception handling;
- mandatory enterprise dimensions for a one-location shop;
- a clone of ServiceTitan's menu, terminology, or visual density.

## Decisions needed before these recommendations become plans

1. Which accounting destination matters first: QuickBooks Desktop, QuickBooks Online, Xero, or transparent CSV/manual journal entry?
2. Is the first company cash- or accrual-oriented, and how does it close each month today?
3. How many tax jurisdictions, exemptions, cash/check deposits, and processor payouts occur in practice?
4. How frequent are partial receipts, vendor backorders, truck transfers, physical counts, returns, and core charges?
5. Should one installation explicitly equal one legal entity, with optional branches inside it?
6. Which queues need an individual owner and due date, and which are shared office work?
7. What is the smallest role set that needs different default density without multiplying UI variants?

## Sources and evidence

### BellField sources

Primary local sources include:

- [Product rules](./product-rules.md)
- [Workflows and state machines](./workflows-and-state-machines.md)
- [Screen behavior specification](./screen-behavior-spec.md)
- [Permissions model](./permissions-model.md)
- [Data-modeling rules](./data-modeling-rules.md)
- [Offline sync](./offline-sync.md)
- [Milestone implementation plan](./milestone-implementation-plan.md)
- [What has shipped](./whats-shipped.md)
- [Comparison rubric](./fsm-comparison-rubric.md)
- the current contracts, API repositories/services, reporting queries/CSV definitions, and office workspace source under `apps/` and `packages/`

### Current official ServiceTitan sources

- [Accounting periods](https://help.servicetitan.com/how-to/use-accounting-periods)
- [Batch, post, and export transactions](https://help.servicetitan.com/docs/batch-post-and-export-transactions)
- [Close your books](https://help.servicetitan.com/docs/close-your-books)
- [Reconcile payments and deposits](https://help.servicetitan.com/docs/reconcile-payments-deposits)
- [Collect what you're owed](https://help.servicetitan.com/docs/collect-what-youre-owed)
- [Customer statements](https://help.servicetitan.com/residential-s-r/docs/send-customer-statements)
- [Recurring billing](https://help.servicetitan.com/docs/process-recurring-billing-for-memberships-and-service-agreements)
- [Deferred revenue setup](https://help.servicetitan.com/docs/set-up-deferred-revenue)
- [Accounts payable](https://www.servicetitan.com/features/accounts-payable)
- [Performance pay overview](https://help.servicetitan.com/docs/performance-pay-overview)
- [Business units](https://help.servicetitan.com/docs/add-and-edit-business-units-2)
- [Accounting integrations](https://www.servicetitan.com/features/accounting/integrations)
- [Field service ERP integration](https://www.servicetitan.com/blog/field-service-erp-integration)
- [Inventory management](https://www.servicetitan.com/industries/electrical-software/inventory)
- [Inventory and purchase orders overview](https://help.servicetitan.com/docs/inventory-and-purchase-orders)
- [Units of measure](https://help.servicetitan.com/docs/utilize-unit-of-measure-for-transactions)
- [Create cycle counts](https://help.servicetitan.com/docs/create-cycle-counts)
- [Inventory availability and serials](https://help.servicetitan.com/docs/inventory-items-overview)

Authenticated tenant observations are intentionally described without private record values and are not public citations.

## Prompt record

The prompt record is included so future passes can reproduce the scope and distinguish the lead and supporting agents.

### User prompt to the primary Codex agent

> lets do another observation to close some of the competitive gaps between bellfield and service titan etc. please use [$chrome:control-chrome](C:\Users\blaine4.codex\plugins\cache\openai-bundled\chrome\26.707.62119\skills\control-chrome\SKILL.md) and do another comparison pass and see what gaps exist between what we offer versus service titan and how we can do it better, spin up some agents and do a deeper pass. we need to think of more than surface value things and also how accounting, inventory, and other less obvious features can be improved upon to be competitive while maintaining a user friendly and intuitive design. we might also see if we're already suffering on design issues anywhere or where we might already be shooting ourselves in the foot etc. lets document this pass. include your name, date, prompts etc and lets keep track of research passes like this and make sure your passes never get confused for claude or another agent etc.

### Codex accounting sub-agent prompt

> You are an analysis sub-agent for BellField competitive research. Do not edit any files. Read AGENTS.md, README.md, docs/README.md, docs/repo-map.md, docs/engineering-standards.md, docs/product-rules.md, docs/workflows-and-state-machines.md, docs/permissions-model.md, docs/data-modeling-rules.md, docs/milestone-implementation-plan.md, docs/fsm-comparison-rubric.md, and all existing docs/fsm-comparison-servicetitan-2026-06\*.md reports. Then perform a deep accounting/financial-operations gap analysis between BellField as currently documented/implemented and mature field-service suites such as ServiceTitan. Go beyond invoice/payment basics: examine close controls, AR/AP boundaries, deposits, credits/adjustments, tax, reconciliation, batches, auditability, period locking, revenue recognition/deferred revenue for agreements, payroll/commission dependencies, export/sync failure handling, job profitability, multi-entity/location questions, and controller/bookkeeper daily work. Distinguish confirmed current BellField capability, documented-but-not-built direction, and proposed capability. Identify ways BellField can beat ServiceTitan for small shops through clarity and safe defaults without trying to become a full general ledger. Return: (1) evidence-backed findings with local file/line references, (2) top risks/self-inflicted traps, (3) prioritized recommendations with milestone/dependency notes, (4) explicit uncertainties. Include your agent task name and state that this is a Codex sub-agent analysis. No web browsing unless needed; if used, cite direct URLs and prefer official primary sources.

### Codex inventory and operations sub-agent prompt

> You are an analysis sub-agent for BellField competitive research. Do not edit any files. Read AGENTS.md, README.md, docs/README.md, docs/repo-map.md, docs/engineering-standards.md, docs/product-rules.md, docs/workflows-and-state-machines.md, docs/permissions-model.md, docs/data-modeling-rules.md, docs/offline-sync.md, docs/milestone-implementation-plan.md, docs/fsm-comparison-rubric.md, and all existing docs/fsm-comparison-servicetitan-2026-06\*.md reports. Then perform a deep inventory/procurement/operational-control gap analysis between BellField and mature field-service suites such as ServiceTitan. Go beyond surface CRUD: truck/warehouse custody, replenishment, min/max, purchasing lifecycle, partial receipts, backorders, returns/RMAs, substitutions/supersession, lot/serial/warranty/core charges, vendor pricing/UOM, physical counts/cycle counts, transfers, reservations/allocations, negative stock policy, job consumption and costing, equipment conversion, offline technician usage/conflicts, approvals, fraud/shrinkage controls, and exception work queues. Separate confirmed current BellField capability, documented-but-not-built direction, and proposals. Identify simpler workflows and safe defaults that could outperform enterprise complexity for small shops. Return: (1) evidence-backed findings with local file/line references, (2) top risks/self-inflicted traps, (3) prioritized recommendations with milestone/dependency notes, (4) explicit uncertainties. Include your agent task name and state that this is a Codex sub-agent analysis. No web browsing unless needed; if used, cite direct URLs and prefer official primary sources.

### Codex UX and architecture sub-agent prompt

> You are an analysis sub-agent for BellField competitive research. Do not edit any files. Read AGENTS.md, README.md, docs/README.md, docs/repo-map.md, docs/engineering-standards.md, docs/product-rules.md, docs/workflows-and-state-machines.md, docs/screen-behavior-spec.md, docs/permissions-model.md, docs/data-modeling-rules.md, docs/milestone-implementation-plan.md, docs/fsm-comparison-rubric.md, and all existing docs/fsm-comparison-servicetitan-2026-06\*.md reports. Inspect current office-web source structure and tests as needed. Perform a deep UX/product-architecture risk analysis: information architecture, cross-module continuity, progressive disclosure, role-based density, exception visibility, destructive-action safety, keyboard speed, accessibility, empty/error/loading states, responsive behavior, design consistency, terminology drift, duplicate business logic, dashboard/report trust, notification/task overload, and places BellField may already be shooting itself in the foot. Contrast enterprise FSM patterns with BellField's self-hosted small-shop promise. Separate confirmed evidence from inference and proposals. Return: (1) evidence-backed findings with local file/line references, (2) concrete design-system or workflow recommendations, (3) prioritized risks and dependencies, (4) explicit uncertainties. Include your agent task name and state that this is a Codex sub-agent analysis. No web browsing unless needed; if used, cite direct URLs and prefer official primary sources.

## Research caveats

- Tenant observation is a workflow sample, not proof that every ServiceTitan edition, configuration, or integration behaves identically.
- BellField capability claims are grounded in current local code and documentation, not only prior scorecards.
- The office app was not started for this pass because the expected BellField services were not already running; source and prior BellField observations were used instead.
- No recommendation here changes a milestone, product invariant, permission, schema, or accounting rule by itself.
- No private tenant values were retained in this artifact.
