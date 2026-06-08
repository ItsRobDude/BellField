# Catalog Phase Plan

This document defines the next planning lane for BellField's trade-neutral **Catalog**.

The Catalog is BellField's practical answer to the ServiceTitan-style pricebook gap, but it
must stay aligned with BellField's identity:

- useful for technicians first
- practical for small shops
- trade-neutral by default
- compatible with inventory, estimates, register entries, invoices, and job costing
- boring, history-safe, and maintainable

This is a phase plan, not a replacement for the product source-of-truth docs.
If this document conflicts with `product-rules.md`, `workflows-and-state-machines.md`,
`data-modeling-rules.md`, `offline-sync.md`, or `permissions-model.md`, the focused
source-of-truth doc wins until the conflict is intentionally resolved.

---

## 1. Decisions Already Made

- The UI label should be **Catalog**, not Pricebook.
- HVAC may be used as starter/demo data, but the schema must remain trade-neutral.
- The first useful workflow should help **field technicians** add common services, parts,
  labor, fees, and equipment-related charges without typing everything from scratch.
- Office administration should follow closely, but the first product test is whether a tech
  can use the Catalog on a job.
- The Catalog should tighten BellField's market gap without dragging the product into broad
  marketing-suite, customer-portal, or full accounting-suite scope.

---

## 2. Product Goal

The Catalog should make BellField better at selling and billing normal field-service work.

In plain language:

- office staff define reusable things the company sells or charges for
- technicians pick those things while capturing work
- selected catalog items become register entries and invoice draft lines
- estimates can later be built from the same catalog
- prices and descriptions are snapshotted so historical jobs and posted invoices keep their
  original meaning

The Catalog should reduce field typing and billing cleanup without making every shop maintain a
giant enterprise pricebook before they can work.

---

## 3. What The Catalog Is

The Catalog is a company-maintained list of sellable or chargeable entries.

Expected broad kinds:

| Kind        | Meaning                                                                           | Trade-neutral examples                                                               |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `service`   | A task or flat-rate service sold to a customer                                    | Diagnostic visit, drain cleaning, panel inspection, tune-up, door spring replacement |
| `part`      | A non-equipment material or part commonly charged to a job                        | Capacitor, filter, outlet, valve, belt, hose                                         |
| `equipment` | A sellable/installable asset or serialized equipment item                         | Condenser, water heater, opener motor, pump, appliance control board                 |
| `labor`     | Labor sold by time or flat amount                                                 | Standard labor hour, after-hours labor, helper labor                                 |
| `fee`       | Operational charge not tied to a physical part                                    | Trip fee, dispatch fee, permit fee, disposal fee                                     |
| `discount`  | A negative customer-facing adjustment                                             | Senior discount, coupon, courtesy discount                                           |
| `agreement` | A sellable service agreement or plan line, before full agreement lifecycle exists | Annual maintenance plan, pool service plan, priority plan                            |
| `other`     | Escape hatch for unusual chargeable work                                          | Shop-defined one-off                                                                 |

Important rule:

- Catalog kind is about how the item is sold or charged.
- Inventory kind is about stock movement and valuation.
- Those are related but not the same thing.

---

## 4. What The Catalog Is Not

The Catalog is not:

- a hardcoded HVAC pricebook
- a complete ServiceTitan clone
- a full marketing suite
- a customer portal
- an accounting system
- a replacement for inventory movements
- a way to rewrite posted invoices or historical estimates
- a requirement that every shop maintain thousands of rows before using BellField

BellField should support simple shops with a short Catalog and more mature shops with a larger
one.

---

## 5. Trade-Neutral Modeling Direction

### 5.1 Catalog item identity

A catalog item should support, at minimum:

- name
- code or SKU
- kind
- category
- optional trade tags
- active/inactive status
- unit
- customer-facing description
- internal notes
- taxable default
- default sale price
- optional member/agreement price
- optional estimated labor hours
- optional cost hint
- optional link to an inventory item

Examples:

- HVAC demo item: `service` / "Cooling diagnostic"
- plumbing demo item: `service` / "Drain clearing"
- electrical demo item: `service` / "Outlet replacement"
- garage door demo item: `part` / "Torsion spring"
- pool service demo item: `agreement` / "Monthly pool service plan"

### 5.2 Category and tags

Categories should be shop-defined and broad:

- Diagnostics
- Repairs
- Maintenance
- Install
- Materials
- Equipment
- Fees
- Discounts
- Agreements

Trade tags are optional and should not drive core behavior:

- HVAC
- Plumbing
- Electrical
- Pool
- Garage Door
- Appliance
- General

The schema should not require a trade tag.

### 5.3 Inventory linkage

A catalog item may optionally link to an inventory item.

This matters when:

- the tech selects a stocked part from truck stock
- the item should issue inventory to the job
- job cost should use inventory valuation instead of a guessed cost

Important rules:

- a catalog `part` does not automatically mean stock is tracked
- an inventory item does not automatically mean it is customer-facing or sellable
- when linked, the register capture should preserve both the selling snapshot and the
  inventory/job-cost behavior

### 5.4 Snapshot rules

When a catalog item is used on a register entry, estimate, or invoice line, BellField should
snapshot the values needed to preserve history:

- catalog item id when available
- name
- code/SKU
- kind
- customer-facing description
- unit
- selected quantity
- selected unit price
- taxability at the time of selection
- selected member/agreement price status when relevant

Later edits to the catalog must not silently rewrite old estimates, register entries, invoice
draft lines, posted invoices, or job histories.

---

## 6. Field-First Workflow

### 6.1 Field register selection

The first practical technician workflow should be:

1. Open assigned job.
2. Open Register.
3. Tap **Add from Catalog**.
4. Search or browse by category.
5. Pick a service, part, labor, fee, equipment item, discount, agreement, or other entry.
6. Confirm quantity and price if permitted.
7. Save locally.
8. Sync later when connectivity allows.

The field UI should avoid a giant pricebook table.
It should feel like a fast picker:

- recent/common items
- search
- category chips or tabs
- clear item name
- price visible when allowed
- short description
- quantity stepper/input
- notes when needed

### 6.2 Field offline behavior

The field app should cache only the catalog data needed for field use.

Initial practical default:

- active catalog items
- categories
- lightweight search fields
- prices the technician is permitted to see/use
- inventory-linked status enough to support truck-stock capture

Open questions for implementation:

- whether to cache the whole active catalog for small shops
- whether to later support configurable field catalog windows or trade/category filters
- how much customer/member pricing logic belongs offline in v1

Conservative v1 behavior:

- field selection saves a catalog snapshot locally
- sync submits the snapshot and catalog item id
- server accepts stale-but-valid offline work as preserved field work
- if the catalog item became inactive before sync, office history should show that it was
  selected from an older field snapshot rather than losing the work

### 6.3 Field permissions

Technician permissions should distinguish:

- view catalog item
- add catalog item to register
- override sale price
- see internal cost
- select discount
- sell agreement line

Default technician behavior should be broad enough to work, but not expose internal cost unless
the company explicitly allows it.

---

## 7. Office Workflow

Office administration should come after or alongside the field scaffold.

Office users should be able to:

- view active/inactive catalog items
- create catalog items
- edit current catalog item details
- mark items inactive
- link catalog items to inventory items
- set default price and optional member/agreement price
- set category and tags
- define customer-facing descriptions
- review where a catalog item has been used

Catalog admin should be a full office surface later, but the first implementation can be a
plain, reliable workbench.

Important:

- office catalog edits affect future selections
- existing register/estimate/invoice lines keep their snapshots
- inactive items stay visible in historical usage and explicit inactive views

---

## 8. Estimate And Invoice Integration

### 8.1 Register to invoice

Catalog-selected register entries should continue to follow the existing register-to-invoice
reflection rule:

- active register entry creates or updates an invoice draft line
- office edits can detach the invoice line from later register changes
- posted invoices remain locked
- late field sync after posting preserves the register entry and records that it was not
  reflected into the locked invoice

### 8.2 Estimate builder

The Catalog should later become the source for estimate lines.

Practical sequence:

1. Add catalog-backed register entries for field usefulness.
2. Add office catalog admin.
3. Add estimate builder catalog selection.
4. Add option groups such as good/better/best.
5. Add field estimate builder after the field catalog picker is trustworthy.

This keeps the first slice useful without pretending the full selling suite is ready.

---

## 9. Accounting Handoff Relationship

The Catalog should support accounting handoff without becoming accounting software.

Useful fields for later export/reporting:

- income category or revenue category
- taxable default
- inventory-linked cost behavior
- optional accounting export code

Near-term accounting improvements should stay practical:

- invoice and estimate PDF/export
- AR aging
- payment/deposit batch views
- sales tax summary
- CSV export for posted invoices/payments before deep QuickBooks integration
- export status on posted records

Do not start deep accounting integration until the Catalog and document/export basics are
trustworthy.

---

## 10. Service Agreement Boundary

The Catalog may support an `agreement` kind as a sellable line before full recurring agreement
workflow exists.

That does not mean full memberships have shipped.

Deferred full agreement behavior:

- agreement record
- covered locations/equipment
- recurring visits
- renewal date
- billing cadence
- included discounts
- customer communication
- agreement reports

Use broad language:

- service agreement
- maintenance plan
- recurring service plan

Avoid making the first model HVAC-only.

---

## 11. Seed And Demo Data

Seed/demo data may include HVAC examples because HVAC is an important reference case.

However, the seed set should prove broad-trade flexibility.

Recommended starter seed categories:

- Diagnostics
- Repairs
- Maintenance
- Install
- Materials
- Equipment
- Fees
- Discounts
- Agreements

Recommended demo rows:

- HVAC: Cooling diagnostic
- HVAC: 16x20x1 filter
- HVAC: Contactor replacement
- Plumbing: Drain clearing
- Electrical: Outlet replacement
- Garage door: Torsion spring replacement
- Pool: Monthly pool service plan
- General: Trip fee
- General: After-hours labor
- General: Courtesy discount

The product should never require those examples to exist in production.

---

## 12. Phased Implementation Recommendation

### Phase 0 - Product and schema plan

Goal:

- finalize the trade-neutral catalog model
- decide how catalog items link to existing inventory items
- decide first permission names
- decide field offline snapshot shape

Output:

- migration plan
- contract shape
- API surface plan
- field picker UX sketch

### Phase 1 - Field catalog scaffold

Goal:

- make technicians able to add catalog-backed register entries from assigned jobs

Scope:

- read active catalog items into field assigned-work or a field catalog endpoint
- field picker in Register
- local queued operation with catalog snapshot
- sync replay into existing register entry creation path
- invoice draft reflection through the existing register flow

Not yet:

- full office admin polish
- estimate option builder
- field estimate builder
- service agreement lifecycle
- customer communication automation

### Phase 2 - Office catalog admin

Goal:

- let office/admin users maintain the Catalog.

Scope:

- office Catalog nav/surface
- create/edit/inactive
- categories/tags
- price/cost/tax/default fields
- optional inventory item link
- usage visibility

Status:

- First office workbench slice is implemented: office users with `catalog:view` can browse
  active/inactive Catalog rows; `catalog:create` and `catalog:edit` control writes; Catalog
  rows can carry pricing, tax defaults, cost hints, categories/tags, accounting/export codes,
  field visibility, and optional inventory links.
- Usage visibility is currently a register-entry usage count. Detailed drill-down is deferred.

### Phase 3 - Estimate builder catalog selection

Goal:

- let office build estimates from Catalog items.

Scope:

- add catalog-backed estimate lines
- snapshot line data
- convert approved estimate into invoice draft using existing conversion behavior

### Phase 4 - Estimate options

Goal:

- support good/better/best style selling without trade-specific assumptions.

Scope:

- option groups
- one approved option path
- declined option history
- clear office workflow for follow-up appointments

### Phase 5 - Documents and accounting handoff

Goal:

- make billing/customer-facing output feel commercially real.

Scope:

- invoice PDF/export
- estimate PDF/export
- AR aging
- deposit/payment batch views
- CSV export for posted invoices/payments
- sales tax summary

### Phase 6 - Service agreements

Goal:

- turn agreement catalog lines into real recurring-service agreements.

Scope:

- agreement records
- covered locations/equipment
- recurring visit templates
- renewal/billing cadence
- agreement reporting

---

## 13. First Slice Recommendation

The smallest useful first implementation slice is:

1. Add a trade-neutral catalog item model and migration.
2. Add backend read endpoint for active field-usable catalog items.
3. Add a field Register **Add from Catalog** picker.
4. Queue catalog-backed register entries offline with a snapshot.
5. Replay those entries through the existing register-to-invoice reflection path.
6. Seed a small broad-trade demo catalog.

This slice is valuable even before office catalog admin is polished because it proves the core
promise:

- technicians can pick known work/items quickly
- billing gets cleaner register lines
- invoice draft behavior still works
- field offline behavior remains trustworthy
- the schema does not collapse into HVAC-specific assumptions

---

## 14. Open Questions To Resolve Before Implementation

- Should the first field picker cache the full active Catalog, or only a field-usable subset?
- Should technicians be allowed to override sale price by default?
- Should discounts be technician-selectable by default, or office-only?
- Should inventory-linked parts prefer the existing truck-stock picker, or should the Catalog
  picker include truck-stock availability inline?
- Should a catalog item's cost hint be visible to office only by default?
- Should member/agreement pricing be a passive price field first, or deferred until service
  agreements are real?
- Should categories be free-text strings first or managed rows from the start?

Conservative defaults:

- cache active field-usable items
- no technician cost visibility by default
- no technician price override by default
- discounts office-only unless granted
- categories as managed rows if the migration cost is small; otherwise plain text for the
  first slice
- member/agreement price field allowed, but no full agreement lifecycle yet

---

## 15. Success Criteria

The Catalog first slice is successful when:

- a technician can add a catalog item to a job register in the field app
- the operation can queue offline and sync later
- the resulting register entry is readable to the office
- the invoice draft reflects the line correctly
- catalog line snapshots preserve what the tech selected
- inactive/deleted catalog changes do not erase historical meaning
- demo data proves multiple trades, not just HVAC
- no posted invoice or job-cost finalization rule is weakened
