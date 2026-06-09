# BellField vs. Major FSM — Comparison Rubric (v2)

A 100-point rubric for grading a field-service management (FSM) platform's UI and
functionality across office and field use. Tuned for the ServiceTitan / Jobber /
Housecall Pro / FieldEdge family with BellField's priorities: operational depth,
small-shop usability, history safety, field practicality, and trustworthy money
workflows.

This is an evaluation tool, not a product source-of-truth doc. It does not define
BellField behavior — the docs under `docs/` own that. Basis: grounded in the BellField
docs, especially [product-rules.md](./product-rules.md),
[screen-behavior-spec.md](./screen-behavior-spec.md),
[workflows-and-state-machines.md](./workflows-and-state-machines.md),
[offline-sync.md](./offline-sync.md), and [permissions-model.md](./permissions-model.md).

---

## How To Score

Each row is scored **0–5**:

| 0       | 1    | 2    | 3      | 4      | 5         |
| ------- | ---- | ---- | ------ | ------ | --------- |
| missing | poor | weak | usable | strong | excellent |

A row's point contribution is **`(score ÷ 5) × Pts`**. The whole rubric's Pts sum to
**100**, so a perfect product scores 100. (Example: Dispatch is worth 10 Pts; a score of
4 contributes `(4÷5)×10 = 8`.)

### Two tracks — score BellField on both

Grading a mid-build product against a mature one on a single axis is misleading: the
mature one wins deferred-scope rows by default. So score every row twice.

- **Track A — Capability parity (vs the competitor).** 5 = BellField is at or above the
  competitor on this row; 3 = usable but clearly behind; 0 = the competitor has a real
  capability BellField entirely lacks. **Headline: "how far behind the market are we."**
  If both products are weak, BellField may score high on parity while the competitor's
  absolute score still shows the category is not good yet.
- **Track B — Fit-for-intent (vs the Excellent Standard, scope-adjusted).** Score
  BellField against the row's Excellent Standard, but **only for capabilities inside
  BellField's current declared scope** — deferred items (see _Out-of-scope_ below) do not
  count against it. **Headline: "how good is what we've actually built."**

Also record the **competitor's** absolute score (0–5 vs the Excellent Standard) so you
know when the _competitor_ is weak on a row, not just BellField.

Your stated goal — "are we nailing dispatch / booking / job-screen detail / inventory /
bookkeeping" — is a **Track B** question. The roadmap gap is **Track A**.

### Grade bands (apply to each track's /100 total)

|  Score | Grade | Meaning                                       |
| -----: | ----- | --------------------------------------------- |
| 90–100 | A     | Excellent operational platform                |
|  80–89 | B     | Strong, with manageable gaps                  |
|  70–79 | C     | Usable, but risky or inefficient in places    |
|  60–69 | D     | Works for demos, weak for real operations     |
|    <60 | F     | Not trustworthy for serious field-service use |

### Three lens read-outs

Besides the weighted /100, report three **weighted** lens scores grouped by the **Lens**
tag on each row — so you can answer "is the office side good? the field side? the
correctness side?" independently:

- **O — Office UI:** can CSR, dispatcher, bookkeeping, admin, owner do daily work fast?
- **F — Field UI:** can technicians work under stress, on mobile, with weak signal?
- **C — Business correctness:** is history, billing meaning, permissions, auditability preserved?

A row may carry more than one lens. For each lens, include every tagged row and calculate
`sum(row contribution) ÷ sum(tagged row Pts) × 100`. Do not use a raw average; a 2-point
row should not count the same as a 12-point row.

### Evidence method (important — the tool can't see everything)

| Evidence     | What it covers                                                         | How                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI**       | Office surfaces                                                        | Drive in Chrome (BellField + competitor web app).                                                                                           |
| **Field**    | Field-mobile (the heaviest row, 12 Pts)                                | Chrome **cannot** drive the Expo/RN app. Use BellField's real-hardware smokes (`docs/field-mobile-smoke.md`) + competitor demo videos/docs. |
| **Code/API** | Backend enforcement (permissions, posting locks, history immutability) | A browser can't tell an enforced rule from a hidden button. Confirm BellField from source; take the competitor on documented faith.         |

Rows that **cannot** be judged from Chrome alone are flagged `[Field]` or `[Code]` below.

---

## Rubric

| #   | Area                                                                 | Pts | Lens  | Excellent Standard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------- | --: | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Navigation, speed & information architecture                         |   5 | O/F   | Office users reach common workflows in 1–3 clicks; field users act in a few taps. Search works by customer, location, job, invoice, contact phone, and equipment serial. Dense screens use tabs, drawers, tables, filters, and clear headers — not clutter or endless scrolling.                                                                                                                                                                                                                                            |
| 2   | At-a-glance information sufficiency _(dispatch cards + job screens)_ |   6 | O/F   | The right fields are visible **without a click** and the rest is hidden cleanly. A dispatch card conveys who/where/when/what/status at a glance; a job screen surfaces customer, location, bill-to, status, next appointment, balance, and flags without hunting. Density is tuned: not sparse, not a wall. _(This is a distinct axis from row 1 — a fast-to-reach screen can still show the wrong amount of information.)_                                                                                                 |
| 3   | Customer, location & contact management                              |   8 | O/C   | Customers have multiple service locations, contacts, billing contacts, phone/email rows, inactive flags, and Do-Not-Service warnings. Location ownership changes preserve history. Job-level bill-to overrides do not accidentally change the location owner.                                                                                                                                                                                                                                                               |
| 4   | Equipment & service history                                          |   6 | O/F/C | Equipment-heavy trades supported with separate asset records, serial/model, status, install date, filter sizes, notes, active/inactive history, pending install, and replacement links, plus location-level service history. Field can view/update equipment without wrecking office records.                                                                                                                                                                                                                               |
| 5   | Call booking & job intake / lifecycle                                |   8 | O/C   | Office creates jobs **fast during call intake** — search-or-create customer/location/contact and schedule in one continuous motion, with or without an appointment. Jobs support summary, type/category, origin, work-order number, location, bill-to, status, appointments, estimates, invoice, notes, history. Finished appointments **do not** auto-close the job; office closeout stays deliberate.                                                                                                                     |
| 6   | Dispatch & scheduling                                                |  10 | O     | A serious daily workspace: day view, technician rows, unassigned queue, appointment cards, date navigation, reassignment, rescheduling, status visibility, quick job-detail access. Handles unscheduled jobs, multi-appointment jobs, future appointments, no-answer visits, and reassignment history cleanly.                                                                                                                                                                                                              |
| 7   | Field mobile workflow & offline behavior `[Field]`                   |  12 | F/C   | Technicians see today/tomorrow assigned work, job info, address/contact, equipment, notes, register, photos/files, estimate/invoice preview, finish flow. Notes, statuses, register items, equipment edits, estimates, and media queue offline. Sync status is clear, unsynced work is protected, payments stay online-only unless truly supported.                                                                                                                                                                         |
| 8   | Notes, activity, media & unified history                             |   6 | O/F/C | Notes add easily from office or field. Job history is unified, filterable, readable: status changes, appointment changes, notes, invoice edits, media, sync/conflict flags, and payment/billing events in one coherent timeline. Photos/files upload reliably without blocking other work.                                                                                                                                                                                                                                  |
| 9   | Estimates, pricing, register & invoice draft                         |   8 | O/C   | Estimates attach to jobs and stay visible from locations. Office/field register entries (labor, parts, service items, memberships, other) feed the invoice draft; office reviews/edits draft lines. Multiple estimates and zero-dollar invoices handled cleanly. Catalog-backed pricing, good/better/best options, and service-agreement records are now in BellField scope; deeper pricebook maturity, field estimate building, customer acceptance, and recurring automation remain major Track A parity differentiators. |
| 10  | Billing, payments & accounting safety `[Code]`                       |  10 | O/C   | Drafts editable until posting. Posted invoices **lock** and preserve a customer/location/job snapshot. Corrections use adjustment/credit records, not casual edits. Payments record in office and (if enabled, permissioned, online-validated) in field. Balances and amount due are obvious.                                                                                                                                                                                                                               |
| 11  | Inventory, purchasing, truck stock & job costing                     |   8 | O/F/C | Inventory locations, truck stock, item catalog, stock movements, PO create/order/receive, one-destination PO behavior, equipment-vs-part handling, issue-to-job, and job-cost preview/finalization all work. Field part capture draws from truck stock without forcing techs to manage full inventory.                                                                                                                                                                                                                      |
| 12  | Permissions, audit & safety `[Code]`                                 |   7 | C     | Roles + per-employee overrides for CSR, dispatcher, technician, bookkeeping, admin, owner. Sensitive actions enforced in the **backend**, not just hidden buttons. Deletes, posting, reopening, payments, exports, settings, and device revocation are permissioned and confirmed.                                                                                                                                                                                                                                          |
| 13  | Customer communication & documents                                   |   4 | O     | Readable customer-facing estimates, invoices, notes, appointment context, and payment comms. Text/email/payment integrations are useful but optional; the core platform works without paid extras. **On-my-way / arrival-window notifications** are FSM table-stakes for market comparison; grade them as Track A parity unless BellField has explicitly brought them into current scope.                                                                                                                                   |
| 14  | Reporting, admin, reliability & deployment                           |   3 | O/C   | Owners see open jobs, unpaid invoices, estimates, inventory, job cost, operational warnings. Backups, logs, device access, user accounts, support exports are practical. For self-hosted products, office LAN use, field sync, media storage, backup/restore, and updates are graded heavily.                                                                                                                                                                                                                               |

**Pts total: 5+6+8+6+8+10+12+6+8+10+8+7+4+3 = 100.**

---

## Capability Checklists (derive the 0–5 for priority areas)

For the areas you care most about, score the row by counting capabilities present and
working, rather than eyeballing one blurry 0–5. Rough mapping: tick most → 4–5, about
half → 3, few → 1–2, none → 0.

### Row 2 — At-a-glance information sufficiency

- [ ] Dispatch card shows customer/location name, time, technician, status (color), job type at a glance
- [ ] Dispatch card flags special states (no-answer, needs-review, future, unscheduled, overlap)
- [ ] Job screen header shows status, next appointment, bill-to, balance/amount-due, work-order #
- [ ] Warnings/flags (Do-Not-Service, unsynced, conflict) are visible without drilling in
- [ ] Density is tuned — no horizontal scroll for core fields, no wall of irrelevant data

### Row 5 — Call booking & job intake

- [ ] Start typing the complaint/summary before the customer is chosen
- [ ] Search existing customer/location/contact inline (by name, phone, address)
- [ ] Create a new customer + location + contact mid-intake without leaving the screen
- [ ] Set type/category/origin/work-order and schedule in the same flow
- [ ] Create job **with** first appointment, or **without** (unscheduled) — both land correctly
- [ ] Bill-to override available without altering the location owner

### Row 6 — Dispatch & scheduling

- [ ] Day view with technician rows + unassigned queue
- [ ] Date navigation (today / prev / next / picker) and live status refresh
- [ ] Reassign appointment to another tech (drag or menu) — and it's preserved in history
- [ ] Reschedule date/time (drag or editor) without changing job meaning
- [ ] Change appointment status from the board; color reflects it
- [ ] Open full job detail from a card
- [ ] Multi-appointment jobs, future appointments, overlaps render cleanly

### Row 11 — Inventory / purchasing / job costing

- [ ] Item catalog (parts + equipment-type) and stock locations (warehouse/truck/other)
- [ ] On-hand by item/location with valuation; movement ledger
- [ ] Adjust / transfer / issue-to-job
- [ ] PO create → order → receive; one-destination/no-split enforced
- [ ] Receiving captures actual cost; equipment-vs-part handled (equipment bridge)
- [ ] Field truck-stock part capture that auto-costs on sync
- [ ] Job-cost live rollup + finalized snapshot; corrections are reversals

### Rows 9–10 — Bookkeeping / billing

- [ ] Eager invoice draft per job; register entries reflect automatically
- [ ] Office add/edit/void draft lines; convert approved estimate to draft (append/replace)
- [ ] Post (lock) the invoice; posted lock blocks all edits
- [ ] Adjustment/credit correction records (not casual edits)
- [ ] Record/void payments; amount-due derived and obvious
- [ ] Cross-job bookkeeping worklists (ready-to-post / open balance / recently posted)

---

## FSM Features Intentionally Out Of BellField's Current Scope

Per [whats-shipped.md](./whats-shipped.md), these are **deferred by design**, not defects.
On **Track A (parity)** a competitor may legitimately win these rows; on **Track B
(fit-for-intent)** they must **not** count against BellField.

- Customer estimate acceptance
- Field-app estimate builder
- Invoice PDF export/delivery; automated/online payment-gateway capture
- Route optimization and full drag/drop-with-routing
- Live socket updates (dispatch currently polls)
- Customer portal
- Deep pricebook maturity beyond the trade-neutral Catalog: dynamic/member/add-on pricing, income-account depth, and mature sales presentation
- Recurring service-agreement automation beyond the shipped lifecycle: automatic job/invoice/payment generation and renewal workflows
- **On-my-way / arrival-window customer notifications**
- BellField-hosted SaaS infrastructure

---

## Failure Gates

Hard caps regardless of the weighted total. The first two are **`[Code]`-evidenced** —
confirm from source/API, not by clicking.

- Cap at **C** if field work cannot continue during weak signal, **or** if unsynced work can be lost.
- Cap at **C** `[Code]` if posted invoices can be casually edited after posting.
- Cap at **C** if customer/location/equipment history is **overwritten** instead of preserved.
- Cap at **B** if dispatch is usable but **not a true workspace** — defined as missing **any** of: reassign, reschedule, set-status-from-board, unassigned queue, open-job-from-card.
- Cap at **B** `[Code]` if permissions are mostly UI-only (hidden buttons without backend enforcement).
- Cap at **D** if the field app is just a shrunken office app with poor mobile ergonomics.

---

## Practical Test Scenarios

These are the **primary scoring evidence** — run each on both products and let the
results drive the row scores. (Scenario → rows it exercises.)

1. Create a new customer, location, contact, and job during a phone call. → 1,2,3,5
2. Schedule, reassign, reschedule, and cancel an appointment from dispatch. → 2,6
3. Finish a field visit with notes, parts, photos, and a payment attempt. → 7,8,9,10
4. Work the same field job offline, then sync later. → 7,8
5. Edit equipment from the office and field without losing history. → 4,8,12
6. Add a return visit to an open job instead of creating duplicate work. → 5,6
7. Add register items and confirm they flow into the invoice draft. → 9,11
8. Post an invoice, then try to correct it safely. → 10,12
9. Receive a PO to truck stock, customer location, and job cost. → 11
10. Disable a technician account or revoke a device and confirm history remains intact. → 12

---

## Scoring Sheet (fill during the comparison)

> Competitor: `__________` · Date: `__________`

| #   | Area                                    | Pts | Competitor (0–5 vs std) | BellField — A: parity (0–5) | BellField — B: fit (0–5) | Notes |
| --- | --------------------------------------- | --: | ----------------------- | --------------------------- | ------------------------ | ----- |
| 1   | Navigation, speed & IA                  |   5 |                         |                             |                          |       |
| 2   | Info sufficiency                        |   6 |                         |                             |                          |       |
| 3   | Customer/location/contact               |   8 |                         |                             |                          |       |
| 4   | Equipment & service history             |   6 |                         |                             |                          |       |
| 5   | Call booking & intake/lifecycle         |   8 |                         |                             |                          |       |
| 6   | Dispatch & scheduling                   |  10 |                         |                             |                          |       |
| 7   | Field mobile & offline `[Field]`        |  12 |                         |                             |                          |       |
| 8   | Notes/activity/media/history            |   6 |                         |                             |                          |       |
| 9   | Estimates/pricing/register/draft        |   8 |                         |                             |                          |       |
| 10  | Billing/payments/safety `[Code]`        |  10 |                         |                             |                          |       |
| 11  | Inventory/purchasing/costing            |   8 |                         |                             |                          |       |
| 12  | Permissions/audit/safety `[Code]`       |   7 |                         |                             |                          |       |
| 13  | Customer comm & documents               |   4 |                         |                             |                          |       |
| 14  | Reporting/admin/reliability             |   3 |                         |                             |                          |       |
| —   | **Weighted total (/100)**               | 100 |                         |                             |                          |       |
| —   | **Grade**                               |     |                         |                             |                          |       |
| —   | **Weighted lens read-outs** (O / F / C) |     |                         |                             |                          |       |

---

## Changelog (v1 → v2)

1. **Math closes to 100** (was 102) and the contribution formula is explicit: `(score÷5)×Pts`.
2. **Two-track scoring** added (A: parity vs competitor; B: fit-for-intent, scope-adjusted) so a mid-build product isn't penalized for deliberately-deferred scope.
3. **New row — "At-a-glance information sufficiency"** (6 Pts) isolates the _what's-visible-on-the-card/screen_ axis from navigation speed.
4. **Evidence-method flags** (`[Field]`, `[Code]`) mark rows Chrome can't judge alone.
5. **Weighted three-lens read-outs** wired via a per-row Lens tag (O/F/C).
6. **Capability checklists** added for the priority areas (info-density, booking, dispatch, inventory, bookkeeping) so scores are reproducible, not blurred.
7. **Missing FSM features surfaced** — deeper pricebook maturity, recurring automation, field estimate builder, customer acceptance, communications, and payment/accounting integrations — embedded in the relevant rows plus a dedicated _Out-of-scope_ callout.
8. **Failure gates tightened** — "true workspace" given concrete must-haves; gates needing code/API evidence flagged.
