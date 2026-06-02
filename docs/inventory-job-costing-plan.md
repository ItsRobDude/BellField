# Milestone 9 — Inventory, Purchase Orders, Job Costing — Game Plan

Synthesized by Claude (lead) + Codex (gpt-5.5, xhigh), 2 rounds.

## Architecture (agreed)

Event/ledger model, NOT editable counts:

- `inventory_movements` is an **immutable ledger**; on-hand = SUM of movements per item/location (advisory-lock the (item,location) pair on issue/transfer/adjust to prevent over-issue).
- POs create **expected** cost/qty only — no stock, no job cost — until receiving.
- **Receiving** is where actual unit cost enters (captured per receipt line) and writes movements.
- **Job costing is a read model** over `issueToJob` + `receiveToJob` + labor/expense cost events — NOT derived from invoice/catalog prices (this kills double-counting). Posted invoices stay untouched; their cost columns remain billing/estimate margin snapshots.
- Corrections are **reversal/adjustment events**, never edits/deletes. Unit-cost history is preserved.

## Tables (one migration set, from 20260601_012)

- `inventory_items` — catalog identity only (part vs equipment-type, active). No on-hand/avg-cost stored.
- `inventory_locations` — warehouse/truck/van (customer locations stay in `locations`, not stock locations).
- `purchase_orders` — vendor (freetext v1), status, optional job_id, exactly ONE destination (`destination_inventory_location_id` XOR `destination_location_id`) → no-split is structural.
- `purchase_order_lines` — expected qty + expected unit cost (planning only); part vs equipment + optional equipment metadata.
- `purchase_receipts` + `purchase_receipt_lines` — actual received qty + actual unit cost (cost truth enters here).
- `inventory_movements` — immutable ledger. kinds: receiveToInventory, receiveToJob, issueToJob, transfer, adjustmentGain, adjustmentLoss, returnFromJob. item, qty (signed), unit-cost snapshot, source/dest refs, doc refs (receipt/job/register), actor snapshot, occurred_at, optional reversal_of_movement_id.
- `job_cost_events` — immutable non-inventory cost ledger (labor, expenses); corrections are reversals.
- `job_cost_snapshots` — frozen job cost created when a job goes `completed`; superseded on reopen, never silently recomputed.

## Modules / endpoints

New API modules: `inventory`, `purchasing`, `job-costing` (gated on existing `inventory`/`purchasing` areas; job costing on `jobs:view`/a costing perm).

- inventory: items CRUD, locations CRUD, GET on-hand, POST issues/transfers/adjustments
- purchasing: PO CRUD, :id/order, :id/receive, :id/vendor-invoices (thin)
- job-costing: GET /jobs/:id/costing, POST labor, POST expenses
  Office: Inventory view, Purchasing view, Job Cost tab on job detail. All reuse officeWorkspaceStyles.

## Valuation (v1)

Simplest correct: capture unit cost on every movement; on-hand value + issue cost use **moving-average per item+location** (or latest-receipt cost) — pick one, document it. receiveToJob sidesteps valuation (costed at receipt).

## Equipment bridge

Equipment-tagged receipt to a customer/job location → create a `pendingInstall` equipment row (reuse existing equipment table + placementChanged history); receipt to inventory/truck → equipment row at that inventory location. Non-equipment parts never enter the equipment tab. Install-later and "move to customer location" reuse existing equipment placement/status. Each physical asset gets its own equipment record, so an equipment PO line is exactly one unit (validated at PO create + receive).

**Equipment cost in job cost.** Equipment received to a customer location for a job DOES count toward that job's cost (product decision — for replacement work the equipment is usually the largest cost). On receive, an equipment line bound for a job creates the equipment asset row AND posts a `receiveToJob` movement at the equipment's cost, so the B6 job-cost rollup includes it automatically. This requires the equipment line to reference a catalog item (the movement's provenance), validated at PO create and receive. Equipment received to stock, or to a customer location with no job, is an asset only (no job-cost impact); on-hand never counts equipment (the movement carries no stock location).

## Proposed slices (each shippable + reviewed, like M8)

- S1 Inventory foundation: `inventory_items` + `inventory_locations` + CRUD + office Inventory view. [migration]
- S2 Movement ledger + on-hand: `inventory_movements`, on-hand read model (advisory lock), adjust/transfer. [migration]
- S3 Purchase orders: `purchase_orders` + `purchase_order_lines`, single-destination constraint, draft→ordered, office Purchasing view. [migration]
- S4 Receiving → movements + equipment bridge: `purchase_receipts`(+lines); receive captures cost, writes movements, creates pendingInstall equipment. [migration]
- S5 Issue-to-job + job cost events: `job_cost_events`; issueToJob (valuation), labor/expense. [migration]
- S6 Job costing read model + finalized snapshot: `job_cost_snapshots`; preview + completion hook + reopen-supersede; office Job Cost tab. [migration]
- S7 Polish: permissions sweep, docs (M9 section, api-endpoints, data-modeling-rules, whats-shipped), money-rule + ledger tests.

## Deferred out of v1 (document, don't build)

Partial receipts, returns/RMA depth, cycle counts, reorder points/min-max, multi-currency, multiple valuation methods, vendor master/AP aging, barcode, field-app inventory. Vendor is freetext in v1. PO "invoice" step is a thin vendor-bill reference (cost already entered at receipt).

## Scope note

This is larger than M8 (3 modules, ~8 tables, 3 office surfaces, 6 migrations). It is the correct foundation; the lighter "cost-flow-only, no ledger" alternative was rejected because it would poison job-cost truth and double-count against invoice costs.
