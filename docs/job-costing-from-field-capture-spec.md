# Job Costing From Field Capture — Product Spec

Status: **design only. No code.** This is the spec to build against, not an implementation.

This document defines how work a technician captures in the field becomes both a
customer bill and a job cost, **without lying about margin**. It is the product agreement
that the later slices implement.

It is grounded in what exists today:

- `register_entries` is **billing capture only**. Its columns are `kind` (`labor`,
  `serviceItem`, `part`, `membership`, `other`), `description`, `quantity`, `unit_price`,
  `total_amount`, plus free-text `part_number` / `inventory_source_label`. It has **no cost
  column** and links to **no** cost artifact. The register→invoice reflection
  (`20260601_004_backfill_register_invoice_lines`) writes invoice-line `total_cost_amount = 0`.
- Job cost today (`apps/api/src/modules/job-costing/job-cost-rollup-utils.ts`) sums:
  - material from `inventory_movements` (`receiveToJob` plus issued stock value from
    `issueToJob`; `returnFromJob` is a valid kind with no writer in v1),
  - labor + expense from `job_cost_events`.
- The field never drives cost today. Material cost appears through office inventory/PO
  actions (`issueToJob` or `receiveToJob`), while labor/expense cost appears through
  `job_cost_events`.

The point of this spec is to let field capture drive cost **for the lines that carry trusted
structure**, while everything else is surfaced as incomplete rather than guessed.

---

## 1. Core principle

> **The technician records the work performed. BellField projects that work into billing
> and into cost separately. Neither projection is derived from the other.**

A captured work line therefore has up to three independent projections plus a status:

- **Work line** — what happened on the job (the tech's capture).
- **Billing projection** — what appears on the invoice draft, if anything.
- **Cost projection** — what hits job cost, if anything.
- **Resolution state** — whether costing was applied, intentionally skipped, reversed, or
  still needs office resolution.

Billing and cost are **independent axes**. Any combination is legal:

|                | Billed                         | Not billed                                    |
| -------------- | ------------------------------ | --------------------------------------------- |
| **Costed**     | normal paid work               | warranty / no-charge callback / internal work |
| **Not costed** | markup-only fee, courtesy line | pure note                                     |

The billing projection has its own explicit state. It is not implied by whether the line is
costed:

- `billable` — appears on the invoice draft at a customer-facing amount.
- `noChargeShown` — appears on the invoice draft as a no-charge / warranty line so the
  customer can see the work performed.
- `internalOnly` — does not appear on the customer invoice, but remains on the job record
  and may still carry cost (for callback, training, rework, or internal tracking).
- `notBilled` — intentionally no billing projection and no customer-facing line.

The single most important reason this decoupling exists is the **warranty / no-charge** case:
the customer charge is `$0` but the job still consumed parts and labor. If cost rode on the
billable amount, every warranty job would falsely read as break-even. It must not.

---

## 2. Cost completeness is first-class

This is the rule that keeps the whole feature honest. **Unresolved cost is not zero cost.**

The job-cost rollup must distinguish three quantities, always:

- **Known cost** — cost from lines that resolved to a real, trusted figure.
- **Incomplete cost** — count (and where possible, the lines) that are awaiting resolution
  and have **no** trustworthy dollar figure yet.
- **Final?** — a job's cost is **not final** while any line is in `needsResolution`.

Consequences that the implementation must honor:

1. The rollup response carries `knownCost` **and** an explicit incomplete signal
   (e.g. `unresolvedLineCount` > 0). It is never collapsed to a single "total" that hides
   the gap.
2. **Margin is suppressed or flagged while cost is incomplete.** A job with unresolved cost
   lines may not present a confident margin or profit number. It shows "margin unavailable —
   N cost lines need resolution," not an optimistic figure.
3. **A normal finalized cost snapshot cannot be created while lines are unresolved.** Today
   completion freezes a finalized cost snapshot; that snapshot may not be treated as final if
   any contributing line is `needsResolution`. The default behavior should block finalization
   until the line is resolved. If the product later allows an override, the snapshot must
   carry `costComplete = false` plus the override actor, timestamp, and reason, so no report
   or UI presents it as a complete final cost.
4. **Do not invent a dollar cost for an unresolved line.** A `needsResolution` line
   contributes `0` to _known_ cost and `1` to the _incomplete_ count — never an estimated
   dollar amount — **unless** the line is governed by an explicit estimated/standard cost
   policy (see §4 `laborStandard` and any future `standardMaterial`). Estimated cost is only
   ever shown when a policy says so, and is labeled as estimated, never as actual.

The failure mode this prevents: a pile of unresolved lines quietly making a job look
high-margin until someone clears a side queue. The gap must be visible **on the number**, not
only in a worklist.

---

## 3. The technician never picks an accounting policy

The field UI captures **work**, in the tech's language:

- "Part from truck"
- "Other part" (supply house / not in inventory)
- "Labor"
- "No charge / warranty" (a modifier on a line, or a per-line billing toggle)
- "Diagnostic / service fee"

The tech never sees or selects `trackedInventory`, `laborActual`, etc. The **server infers**
the costing policy from the kind of work and the structure attached to the line (§4). This
keeps cost decisions off the truck and in the office's configuration, where they belong.

---

## 4. Costing policy (inferred server-side)

Each work line is assigned a costing policy on the server. The policy is a data concept, not a
field-facing choice.

| Policy                 | Assigned when                                         | Cost behavior                                |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `none`                 | billing-only line (fee, markup, courtesy, membership) | no cost projection                           |
| `trackedInventory`     | part selected from a real stock location (e.g. truck) | `issueToJob` at actual weighted-average cost |
| `nonStockMaterial`     | "other part" with an entered cost                     | material cost from the entered figure        |
| `laborActual`          | labor line with hours captured                        | hours × burdened rate (§6)                   |
| `laborStandard`        | labor tied to a standard/pricebook task (later)       | standard hours × rate; explicitly estimated  |
| `expense`              | misc job expense                                      | expense cost event                           |
| `compositeServiceTask` | flat-rate task expands to parts+labor (later)         | composite; **out of v1**                     |

Inference rules:

- A part picked from stock with a resolvable on-hand cost → `trackedInventory`.
- `needsResolution` applies **only to lines where a cost projection is expected** (a part, a
  labor line, a material line) but cannot be trusted yet. A **cost-expected** free-text part
  line (no resolvable item/location) → **never** auto-costs; it is preserved for billing and as
  a field note, and its cost side is `needsResolution` until the office picks a real item/source
  or enters a non-stock cost.
- A line that is **not cost-expected** — a billing-only `none`-policy line (fee, markup,
  courtesy, membership) or a pure note — is `notCosted`, **not** `needsResolution`, even when it
  carries free text. Free text alone never creates an unresolved-cost obligation; only an
  expected-but-untrusted cost projection does. This keeps the §2 incomplete-cost count limited
  to lines that genuinely owe a cost figure.
- "No charge / warranty" affects only the **billing** projection. It does **not** suppress the
  cost projection. A warranty part from truck is still `trackedInventory` and still costs.

Field source-data requirement:

- "Part from truck" is only structured enough to cost when the field payload carries a real
  `inventoryItemId`, `inventoryLocationId`, and quantity. In practice, the field app needs an
  offline-cached catalog / truck-stock snapshot so the technician can pick a real item and
  source location without typing free text.
- `part_number` and `inventory_source_label` remain useful historical/display fields, but they
  are not trusted costing identifiers. They cannot drive `trackedInventory` by themselves.
- If a device is offline or its truck-stock snapshot is stale, the server resolves the cost at
  sync time. If the item/location/quantity cannot be trusted then, the billing projection may
  still save, but the cost projection becomes `needsResolution`.

Ledger sign convention (implementation note):

- An `issueToJob` movement is stored **negative at its stock location** (stock leaving), and the
  rollup negates it to get the positive value delivered to the job (`job-cost-rollup-utils.ts`).
  Any new writer that creates `issueToJob` from field capture **must** follow this same
  convention. If a field-driven issue is stored positive, the rollup's `-extended_cost`
  double-negates and the job's material cost flips sign. Match the existing office issue path
  exactly.
- A `returnFromJob` movement (used to reverse an issue — see §7) is the opposite leg: **positive
  at the stock location** (stock coming back), and the rollup subtracts it from job material
  cost. Do not reverse an issue by writing a positive `issueToJob`; write a `returnFromJob`.

---

## 5. Resolution state machine

Every work line carries a costing status:

- `notCosted` — no cost projection applies (e.g. policy `none`), intentionally.
- `applied` — cost projection created and posted (movement/event exists).
- `needsResolution` — a cost projection **is expected** but cannot be trusted yet (free-text
  part, offline/stale stock, missing rate, no resolvable cost). **Counts as incomplete.** A line
  that owes no cost (policy `none`, a pure note) is `notCosted`, not `needsResolution`.
- `reversed` — a previously applied cost was reversed (correction/void).

`needsResolution` is the offline-honest state. When a tech captures a part on a stale or
offline truck count and the server cannot resolve a real cost at sync time, the line still
produces its billing/invoice side, but its cost side parks in `needsResolution`. The system
does **not** invent a cost, and does **not** block the technician. The office resolves it.

---

## 6. Burdened labor rate and fallback

Labor cost uses a **burdened cost rate** (loaded labor cost), configured by the office —
**never** the customer-facing bill rate.

- Default: a single company burdened rate.
- Later: optional role-level or per-technician override.
- **Fallback when no rate is configured:** the labor line goes to `needsResolution`. It does
  **not** silently cost `$0` and it does not borrow the bill rate. No configured rate → no
  trusted cost → incomplete, surfaced.

---

## 7. Source links, reversals, and double-count prevention

- **Source links.** Cost artifacts carry a link back to the work line that produced them —
  `inventory_movements.source_register_entry_id` and `job_cost_events.source_register_entry_id`.
  This gives audit ("why is this cost here?"), clean reversal, and idempotency.
- **Idempotency.** The idempotency key is **source line + projection/component**, not the source
  line alone. One work line can legitimately produce more than one cost artifact — a warranty
  visit yields both an `issueToJob` (material) and a labor `job_cost_event` from the same line,
  and a future `compositeServiceTask` expands into several parts plus labor. Each
  `(source_register_entry_id, component)` pair is created **once**; re-syncing or reprocessing the
  same line must not create a second artifact for a component that already exists, but it must
  still allow the line's other components to post. Keying on the source line alone would either
  drop legitimate sibling components or fail to dedupe a re-synced one. This is the backend
  double-count guard.
- **Backend double-count boundary.** The source link prevents exact duplicate cost projection
  from the same work line. It does **not** prove that a separate manual office `issueToJob`
  was not entered later for the same physical part. That broader duplicate risk is handled by
  surfacing already-costed register quantities in the office inventory flow and requiring
  explicit confirmation for suspicious duplicate issues.
- **No-mutate ledgers.** Edits and voids never mutate existing cost rows. A correction posts a
  **reversal** and, if needed, a fresh line. The status moves to `reversed` (and a new line may
  be `applied`). The reversal shape depends on the projection:
  - **Reversing a register-driven `issueToJob` creates a `returnFromJob` movement, not a
    positive `issueToJob`.** `issueToJob` is written with **negative** quantity (stock leaving
    the location; the table enforces `quantity <> 0`), so a positive `issueToJob` is not a
    reversal — it is a second, malformed issue. The reversal must instead **add the
    quantity/value back to the stock location** as a `returnFromJob`, linked to the original via
    the existing `reversal_of_movement_id` column.
  - **The rollup must count `returnFromJob` as a negative job-material contribution.** Today the
    rollup sums only `receiveToJob` + `issueToJob` and explicitly excludes `returnFromJob`
    (which has no writer in v1). Slice 1a adds the `returnFromJob` writer **and** extends the
    rollup to subtract it, so a voided issue correctly removes its material cost from the job.
    Sign parallels the issue path: an issue is negative at the location and adds job cost; a
    return is positive at the location and removes job cost.
  - **Labor / expense reversals** post a reversing `job_cost_event` (negative `amount`), which
    the existing rollup already nets via `SUM(amount)`.
- **Office double-issue guard.** Because a register part already drove an `issueToJob`, the
  office UI should discourage / warn against a **manual** issue-to-job for the same part on the
  same job. The source link makes the already-costed quantity visible so the office does not
  double-count by hand.

---

## 8. Worked examples

| Field action                                 | Billing projection         | Cost projection                   | Policy / status                                |
| -------------------------------------------- | -------------------------- | --------------------------------- | ---------------------------------------------- |
| Replace capacitor, bill customer             | invoice line at sell price | `issueToJob` at weighted-avg cost | `trackedInventory` / `applied`                 |
| Warranty capacitor replacement               | `$0` / no-charge line      | `issueToJob` + labor cost         | `trackedInventory` + `laborActual` / `applied` |
| Diagnostic fee (hours captured)              | invoice line               | labor cost at burdened rate       | `laborActual` / `applied`                      |
| Discount / courtesy credit                   | billing adjustment only    | none                              | `none` / `notCosted`                           |
| Supply-house part, cost entered              | invoice line               | entered non-stock material cost   | `nonStockMaterial` / `applied`                 |
| Supply-house part, no cost yet               | invoice line               | none yet                          | `nonStockMaterial` / `needsResolution`         |
| Tech typed cost-expected free-text part      | invoice line (maybe)       | none yet — **not** fake cost      | `needsResolution`                              |
| Tech typed free-text note / billing-only fee | invoice line (maybe)       | none — no cost expected           | `none` / `notCosted`                           |
| Part from truck, stock count stale/offline   | invoice line               | none yet                          | `trackedInventory` / `needsResolution`         |
| Labor line, no burdened rate configured      | invoice line (maybe)       | none yet                          | `laborActual` / `needsResolution`              |

---

## 9. Office "cost resolution" worklist

Unresolved cost lines surface in an office worklist. For each, the office can:

- pick a real inventory item + stock source (→ `trackedInventory`, `applied`),
- enter a non-stock material cost (→ `nonStockMaterial`, `applied`),
- enter / configure the missing labor rate (→ `laborActual`, `applied`),
- or consciously mark the line zero-cost (recorded as an explicit decision, not a silent gap).

The worklist is the _mechanism_; §2 (cost completeness on the rollup) is the _guarantee_. The
worklist must never be the only place the gap is visible.

---

## 10. The rules (build against these)

1. Billing and costing are independent axes.
2. Billing projection state is explicit (`billable`, `noChargeShown`, `internalOnly`,
   `notBilled`) and separate from costing state.
3. The tech UI captures work, not accounting policy; the server infers the costing policy.
4. **Cost completeness is first-class:** the rollup distinguishes known cost from incomplete
   cost, suppresses/flags margin while cost is incomplete, and does not treat a job's final
   cost as final while any line is `needsResolution`.
5. Structured parts from stock create `issueToJob` movements at actual weighted-average cost.
   They require real item/location ids, not free-text labels.
6. Labor cost comes from configured **burdened** rates, not bill rates; no rate → `needsResolution`.
7. Warranty / no-charge work can still create real cost. No-charge affects billing only.
8. A **cost-expected** line (part / labor / material) that is free-text, or backed by
   stale/offline inventory, **cannot invent cost** — it becomes `needsResolution`. Lines that owe
   no cost (`none`-policy fees, pure notes) are `notCosted`, even with free text. Estimated dollar
   cost appears only under an explicit estimated/standard policy, labeled as such.
9. Cost artifacts link back to their source work line (`source_register_entry_id`).
10. Edits and voids post reversals; cost ledgers are never mutated in place. Cost generation is
    idempotent on **(source line + projection/component)**, not the source line alone, so a line
    that yields several artifacts (material + labor, or a composite) dedupes each component
    independently. The source link also warns the office against a manual double-issue.
11. The source link prevents duplicate processing of the same work line, but manual duplicate
    material issues still need office warnings / confirmation.
12. The office gets a cost-resolution worklist — but it is the mechanism, not the guarantee.
    The completeness signal in rule 4 is the guarantee.

---

## 11. Phasing

The §4 requirement that costed parts carry real `inventoryItemId` / `inventoryLocationId` makes
the field-side part of slice 1 larger than it first looks: the technician can only pick a real
item/source if the device has an offline-cached truck-stock / catalog snapshot. To avoid
blocking the costing engine on that device work, slice 1 splits in two.

**Slice 1a — backend + office resolution (no _new_ field UI; backward-compatible API):**

"No field changes" means the field app needs no new screens to ship 1a, **not** that contracts
are frozen. Adding billing-projection state and costing fields touches shared contracts, so 1a
must define **backward-compatible server defaults** for existing field payloads:

- A register/work line that arrives **without** a billing-projection state defaults to
  `billable` (today's behavior — every register line reflects to the invoice).
- A line that arrives **without** costing fields (no `inventoryItemId` / `inventoryLocationId` /
  hours) keeps today's behavior: it does **not** auto-cost. Cost-expected lines that lack a
  trusted figure land as `needsResolution`; everything else is `notCosted`.
- New columns (`inventory_movements.source_register_entry_id`,
  `job_cost_events.source_register_entry_id`) are nullable; existing rows stay valid.

With those defaults, current field builds keep working unchanged while the office gains the new
costing/resolution surface. The field truck-picker that _populates_ the new structured fields is
Slice 1b.

Scope:

- `source_register_entry_id` links, the resolution **status machine**, and the
  completeness-aware rollup (`knownCost` + `unresolvedLineCount`, margin suppressed while
  incomplete, finalization blocked per §2.3).
- **Billing projection persistence + reflection.** The billing-projection state
  (`billable` / `noChargeShown` / `internalOnly` / `notBilled` per §1) is persisted on the work
  line and drives the invoice-draft reflection in this slice — not deferred. A `noChargeShown`
  line reflects to the invoice as an explicit `$0` / no-charge line; an `internalOnly` line is
  kept on the job record and **excluded** from the customer invoice while still able to carry
  cost. This is what makes "costed but not billed" real rather than a model on paper, so it must
  land with the costing engine.
- **No-charge / warranty** support: a line can be costed while billed `$0` (via `noChargeShown`
  or `internalOnly`).
- **Reversal path is in 1a, not deferred.** Editing or voiding a register line that drove a cost
  artifact must post the correct **reversal** per §7, moving the component to `reversed` and
  re-deriving the rollup. For a material issue that means writing a **`returnFromJob`** movement
  (linked via `reversal_of_movement_id`) — **not** a positive `issueToJob` — which requires 1a
  to add the `returnFromJob` writer and extend the rollup to subtract it (it is excluded today).
  Labor/expense reversals post a reversing `job_cost_event`. A costing engine that can create
  cost but not cleanly reverse it on a void is not shippable — corrections happen on day one.
- Today's free-text register lines land as **`needsResolution`** (only where a cost projection
  is expected — §4); the **office** resolves each by picking a real item/source
  (→ `issueToJob` at weighted-average cost) or entering a non-stock / labor cost. This proves
  the engine end to end with zero field changes and can be smoke-verified against the local API
  like the existing M9 / jobs lanes.

**Slice 1b — field truck-picker:**

- Add the offline-cached truck-stock / catalog snapshot so the technician selects a real item
  and source location in the field.
- Structured "part from truck" lines now auto-cost as `trackedInventory` on sync (`issueToJob`
  with `source_register_entry_id`), following the ledger sign convention in §4. Stale / offline
  captures still fall back to `needsResolution` for office resolution.

Deferred to later slices:

- `nonStockMaterial` resolution flow polish and office worklist UI depth.
- `laborActual` rate overrides (role / per-technician).
- `laborStandard`, pricebook / flat-rate, and `compositeServiceTask` expansion. Pricebook is
  **last** — it is a pricing model, not a cost source, and entangling it early would reintroduce
  "cost derived from price," which rule 1 forbids.

---

## 12. Out of scope / non-goals

- Deriving cost from sell price or flat-rate price.
- A pricebook in v1.
- Time-clock / status-timestamp-derived labor hours (a later friction reducer; v1 uses a
  manual hours field).
- Auto-costing free-text lines.
