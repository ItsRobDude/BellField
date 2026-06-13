# BellField vs. ServiceTitan - Scored Comparison (Chrome rerun, 2026-06-12)

Run against [fsm-comparison-rubric.md](./fsm-comparison-rubric.md) v2.

This is the current scorecard after the Phase 5 delivery-relay arc: queued-send
office UI (5.5), the relay deployed to production at `relay.bellfield.app`,
the first real end-to-end estimate email
([relay-deployment-2026-06-12.md](./relay-deployment-2026-06-12.md)),
credentialed release downloads (4.2), and the full install/license/backup/
update runbook set. It supersedes
[fsm-comparison-servicetitan-2026-06-10.md](./fsm-comparison-servicetitan-2026-06-10.md)
for current scoring.

Status note 2026-06-13: Phase 6a acceptance links shipped after this scoring
run and passed a live-relay smoke
([phase-6a-live-acceptance-smoke-2026-06-13.md](./phase-6a-live-acceptance-smoke-2026-06-13.md)).
The weighted scores below are preserved as the 2026-06-12 snapshot until the
next comparison rerun; do not treat the row-9 acceptance caveat as current.

## Method And Caveats

- ServiceTitan was re-inspected live in Chrome in a logged-in tenant at
  `go.servicetitan.com`: Modular Dashboard, Dispatch board (including
  appointment-card hover details and the job side panel), a full job record
  (header facts, contacts, appointments, tasks, and the history feed), Follow
  Up → Unsold Estimates, Accounting (invoice/batch workspace), and the Reports
  library. **Strictly read-only**: no records were created, edited, sent,
  assigned, or saved; no customer details are reproduced in this document —
  observations are about structure and workflow only.
- BellField was not re-driven in the browser for this pass; its movement since
  2026-06-10 is evidenced by the shipped code, the live production relay, the
  5.5 in-browser verification performed on 2026-06-11, and the dated
  deployment/evidence docs. Rows without new evidence keep their 06-10 scores.
- Field-mobile caveats from the 06-10 run still apply.

## Headline Result

| Track                                         |  Score | Grade | Reading                                                                                                                                                   |
| --------------------------------------------- | -----: | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ServiceTitan absolute**                     | **98** | **A** | Unchanged. The live tenant walk reinforced the depth: comms automation, follow-up money worklists, accounting batches/exports, and a real report library. |
| **BellField Track A: parity vs ServiceTitan** | **77** | **C** | Small, real movement from delivery maturity and deployment/reliability. The visible parity gap is now customer comms breadth, payments, and reporting.    |
| **BellField Track B: fit-for-intent**         | **95** | **A** | The chosen core plus a production-grade delivery/deployment story. Within its declared intent, BellField is nearly complete on infrastructure.            |

| Track                 | 2026-06-10 | 2026-06-12 | Movement |
| --------------------- | ---------: | ---------: | -------: |
| ServiceTitan absolute |       98.0 |       98.0 |      0.0 |
| BellField Track A     |       76.1 |       76.8 |     +0.7 |
| BellField Track B     |       93.9 |       94.6 |     +0.7 |

No failure gate tripped. The movement is honest but small, because this week's
work was mostly **infrastructure** (relay, deployment, downloads) — the rubric
rows it feeds (13 and 14) are intentionally low-weight, and the big remaining
Track A losses (comms breadth, payments, reporting, dispatch density) did not
move.

## Scorecard

Contribution = `(score / 5) * Pts`. Rows unchanged from 2026-06-10 keep their
judgments; rows 8, 13, and 14 carry new evidence.

| #   | Area (Pts)                                 |   ST   |   A    |   B    | Judgment                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------ | :----: | :----: | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Navigation, speed & IA (5)                 |   4    |  3.5   |  4.5   | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | At-a-glance info sufficiency (6)           |  4.5   |  3.5   |   4    | Unchanged score, sharper evidence: ST's density is **compact card face + rich hover + status-bucket counters + live map**, not a crammed card. See "Design recipes" below — this is now a buildable spec for BellField dispatch polish.                                                                                                                                                                                                                              |
| 3   | Customer/location/contact (8)              |   5    |   4    |   5    | Unchanged. Fresh evidence: per-contact SMS/notification affordances beside every phone number, and property-data enrichment links on the job.                                                                                                                                                                                                                                                                                                                        |
| 4   | Equipment & service history (6)            |   5    |   4    |   5    | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | Call booking & intake/lifecycle (8)        |   5    |   4    |  4.5   | Unchanged. Fresh evidence: jobs carry campaign attribution and booking provenance in the header facts.                                                                                                                                                                                                                                                                                                                                                               |
| 6   | Dispatch & scheduling (10)                 |   5    |   4    |  4.5   | Unchanged. The board's structure (tech rows with clock-in state, time grid, unassigned grid with per-column filters, status buckets, map with tech/job pins, drag with side-panel quick edit) matches the prior scoring.                                                                                                                                                                                                                                             |
| 7   | Field mobile & offline (12)                |   5    |   4    |   5    | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8   | Notes/activity/media/history (6)           |   5    |   4    |  4.5   | Scores hold, both sides better evidenced. ST's job history is a **unified feed with channel tabs (Events/Calls/Notes/Files/Email/Chat)** including automated SMS entries with delivery status. BellField's timeline now carries real delivery lifecycle events (sent/failed/canceled, and delivered/bounced via the live relay) — correct, but single-channel.                                                                                                       |
| 9   | Estimates/pricing/register/draft (8)       |   5    |  3.5   |  4.5   | Snapshot caveat: at the time of this 2026-06-12 scoring run, customer acceptance had not shipped. Phase 6a shipped on 2026-06-13 and should move this row in the next comparison rerun. Field estimate building remains future.                                                                                                                                                                                                                                      |
| 10  | Billing/payments/accounting safety (10)    |   5    |  3.5   |   5    | Unchanged score. Fresh ST evidence: the accounting workspace is batch-centric (payment-type totals strip, batch lifecycle, "Collect Payments"/recurring billing) with a **per-batch QuickBooks export log**. That is the integration bar for "deep accounting" later.                                                                                                                                                                                                |
| 11  | Inventory/purchasing/costing (8)           |  4.5   |   4    |  4.5   | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | Permissions/audit/safety (7)               |   5    |   4    |   5    | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 13  | Customer comms/documents (4)               |   5    |   3    |  4.5   | **A: 2.5 → 3. B: 4 → 4.5.** Estimate email is no longer a feature with an env var behind it — it is a production service: relay-hosted sending, queued/retry with office-visible state and Cancel, suppression, quotas, and real delivered/bounced statuses flowing back. ST still wins breadth by a mile: automatic booking-confirmation and reminder SMS, per-job notification toggles, chat, email channel history, portals.                                      |
| 14  | Reporting/admin/reliability/deployment (3) |   4    |  3.5   |  4.5   | **A: 3 → 3.5. B: 4 → 4.5.** The 06-10 run said BellField "still needs a practical self-hosted backup/restore/update runbook." That now exists end to end: install/restore/update runbooks, signed artifacts, offline licensing, credentialed downloads, and a deployed relay with dated evidence docs. Remaining A gap is reporting/dashboard breadth — ST greets owners with a KPI dashboard and a 30+ item accounting report library plus a custom report builder. |
| -   | **Weighted total**                         | **98** | **77** | **95** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -   | **Grade**                                  | **A**  | **C**  | **A**  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

(Weighted totals: Track A 76.8, Track B 94.6 — displayed rounded.)

## Fresh ServiceTitan Evidence — Design Recipes Worth Stealing

These are the concrete, buildable patterns this walk surfaced. Each is small
relative to its impact:

1. **Dispatch density recipe (row 2).** Card face: status icon + business-unit
   chip + name + street + multi-visit counter. Hover card: priority + job
   summary, membership/tag flag, assigned tech, phone, full address, booking
   note, arrival window, zone, invoice subtotal. Below the board: clickable
   status-bucket counters (Scheduled / Unconfirmed / Working / Paused / Hold /
   Done / Canceled / Future) acting as filters. BellField can adopt face +
   hover + buckets without maps or routing.
2. **Unsold Estimates worklist (rows 9/14).** Follow Up is a money-on-the-table
   grid: every open estimate with created/next-follow-up dates, opportunity
   status, highest-estimate amount, technician, filters, CSV export — and a
   **dollar total at the bottom**. BellField has the data for this today; it
   is a report + worklist, not a subsystem.
3. **Comms that ride existing rails (rows 8/13).** ST's booking confirmation
   and job reminder are _automatic, logged, per-job suppressible_ — and they
   appear as history entries with delivery status. BellField's equivalent
   first step does not require SMS: email booking confirmation / reminder /
   on-my-way through the already-live relay, logged to the timeline, with the
   existing comms posture (triggered, logged, not spammy).
4. **Owner KPI landing (row 14).** ST's first screen is revenue gauge, trend,
   booking/conversion rates, and technician scorecards with business-unit
   filters. BellField's equivalent "what needs attention" view (open
   balances, unsold estimates, approved-not-scheduled, expiring agreements)
   remains the highest-value reporting slice.
5. **Accounting export bar (row 10).** Batch-centric payments with a visible
   per-batch QuickBooks export log is what "QuickBooks integration" concretely
   means at the suite level. Useful calibration for the eventual accounting
   lane; not a near-term target.

## What Changed Since 2026-06-10 (BellField side)

- **Delivery became infrastructure.** Relay in production behind a Cloudflare
  tunnel; provider key custody physically enforced; queued sends with retry,
  expiry, Cancel, and entitlement states in the office UI; suppression and
  reputation autothrottle; delivered/bounced statuses actually populate now.
  First real estimate email delivered end to end with the webhook receipt.
- **The deployment story completed.** Signed releases, offline licenses,
  credentialed downloads from the relay, backup/restore/update runbooks, and
  dated deployment evidence. The 06-10 run's recommendation #6 ("do the
  self-hosted runbook work before pilot") is done at repo level; only the
  scratch-machine gate day remains as validation debt.
- **Acceptance links were still ahead in this scorecard** — Phase 6a shipped
  on 2026-06-13 after the run; rescore it in the next comparison pass.

## Highest-Leverage Recommendations (re-ranked)

1. **Invoice delivery.** The relay is live and the estimate/acceptance path is proven —
   invoice email is mostly reuse (relay plan §5 anticipated it) and unlocks
   the bookkeeping completeness owners feel first.
2. **Unsold-estimates worklist + owner "needs attention" view.** Cheap,
   data-already-exists reporting with the ST Follow Up pattern as the spec.
3. **Dispatch card density** using the face + hover + status-buckets recipe.
4. **Email-first operational comms** (booking confirmation, reminder,
   on-my-way) on the live relay, logged to the timeline, per-job suppressible.
5. **Refresh the comparison score after Phase 6a** before using the 2026-06-12
   weighted totals as current planning input.
   SMS becomes a provider decision later; the email versions are pure reuse.
6. **Payments planning** unchanged: online-only, posted-invoice-only,
   provider-confirmed, audit-heavy — design after 6a ships.

## Bottom Line

The honest read is unchanged in shape: **A-grade core, C-grade market
competitor** — but the C is now made of different material. Two runs ago the
gap included "can you even install, license, update, and email from this
thing"; that whole layer is now built, deployed, and evidenced. What remains
of the parity gap is genuinely product: customer-facing acceptance and
payments, comms breadth, owner reporting, and dispatch polish. Those are the
right things to be behind on, because every one of them now has rails to run
on.
