# What Is Currently Shipped

This is the current capability overview, not a changelog or a production-readiness
claim. Update the relevant section when a capability or its validation boundary
changes; keep dated evidence in its owning document.

Use the [docs index](./README.md) to find topic owners,
[repo map](./repo-map.md) to find code, and
[launch readiness](./launch-readiness.md) for the pre-pilot checklist.

## Office And Operational Core

- **CRM and equipment:** customers, locations, contacts and shared contact links;
  ownership history, duplicate warnings, SQL-backed search and intake typeahead;
  individual equipment records with history, grouping/replacement links,
  active/inactive status, install/warranty fields, and office/field mutation paths.
- **Jobs and appointments:** jobs with zero or more appointments, follow-up visits,
  scheduling/status changes, finished-visit review, job timelines, and paginated
  queues for review-needed, waiting-on-parts, unscheduled, and open jobs.
- **Dispatch:** dated technician rows and an unassigned queue; date navigation,
  refresh, job-detail opening, schedule/status edits, drag-to-move,
  drag-to-resize, cross-row reassignment, overlap warnings, and context menus.
- **Office usability:** URL-based navigation and browser history, remembered
  sign-in with server revalidation, shared formatting, labeled forms with busy
  state and duplicate-submit protection, in-place confirmations, and dismissible
  action messages. Dispatch auto-refresh reports failures separately from action
  outcomes.

Behavior owners: [product rules](./product-rules.md),
[workflows](./workflows-and-state-machines.md), and
[screen behavior](./screen-behavior-spec.md).
The [2026-06-05 office smoke](./validation-playbook.md#run-log) covers date
navigation, refresh, job opening, schedule/status writes, and selected M9
surfaces with database readback. That dated result does not cover later dispatch
drag interactions or replace future regression testing.

## Estimates, Invoices, And Money

- **Catalog and estimates:** trade-neutral services, parts, labor, fees,
  discounts, and agreements; managed categories and tax defaults; server-owned
  pricing and frozen line/cost/margin snapshots; optioned estimates;
  permission-gated decisions; approved-estimate conversion to an invoice draft;
  printable documents and PDF email delivery.
- **Captured work and invoicing:** each job has one eager main invoice draft.
  Register entries reflect into it until detached by an office edit or blocked
  by posting. Posting locks the invoice and freezes customer/location/job
  display context. Separate adjustment/credit records provide the correction
  path. Posting never closes a job.
- **Tax and numbering:** new drafts seed tax from company settings; corrections
  inherit the corrected invoice's rate; authorized draft-rate edits recalculate
  through shared pricing. Posted tax stays frozen. Posting assigns a durable
  invoice number from the shared series, with kind-specific prefixes and a
  guarded owner-configurable next number. Legacy posted rows remain unnumbered.
- **Payments and deposits:** append-only job-level payments with allocations to
  posted charges, manual payment/deposit entry, amount-scoped online invoice
  links, and job-level deposit links. Invoice-scoped payments allocate to their
  source invoice first; null-source deposits remain job credit until charges
  exist. Existing deposit credit allocates when the main invoice posts.
- **Refunds and receipts:** manual refunds and provider-confirmed online refunds
  use append-only records and allocation reversal. Online payments cannot be
  manually voided. Manual and confirmed online payments, deposits, and refunds
  enqueue customer receipts transactionally, with owner-editable templates and
  toggles; retries do not create duplicate receipts.
- **Bookkeeping and reports:** paginated cross-job worklists for draft posting,
  balances, posted invoices, and payment batches; fixed AR-aging, sales-tax,
  profitability, inventory-valuation, agreement, and ledger reports/exports.

Money and history rules live in [product rules](./product-rules.md),
[workflows](./workflows-and-state-machines.md),
[data modeling](./data-modeling-rules.md), and
[refund design](./refunds-design.md). Catalog scope is in the
[Catalog phase plan](./catalog-phase-plan.md).
Payments remain online-only. Live-relay sandbox proof exists for
[invoice email/payment links](./phase-6b-live-invoice-email-payment-smoke-2026-06-14.md),
[partial links/deposits](./payment-link-depth-live-smoke-2026-06-15.md), and
[online refunds](./online-refund-live-smoke-2026-06-15.md).
Real merchant onboarding and live-money webhook proof remain in the separate
[payments go-live checklist](./gate-day-checklist.md#payments-go-live-separate-track-not-part-of-the-scratch-machine-day).

## Inventory, Purchasing, And Agreements

- **Inventory:** catalog items and stock locations; immutable movements;
  weighted-average valuation and derived on-hand stock; adjustments, transfers,
  issue-to-job, and office management surfaces.
- **Purchasing:** draft/order/receive workflow, one destination per PO, actual
  receiving cost, and an equipment-record bridge. Job-linked receiving is
  limited to customer-destination POs; receiving equipment into stock does not
  also create a job cost.
- **Job cost:** inventory-derived costs plus labor/expense events, reversal
  corrections, and office rollups. Completion freezes a snapshot; cost writes
  require reopening a finalized job before revision.
- **Service agreements:** customer-owned activate/pause/end lifecycle,
  location/equipment coverage, visit templates, informational renewal/billing
  cadence, office workbench and reports, and permitted field read-only coverage.
  Selling an agreement line does not automatically create the lifecycle record;
  automatic job/invoice/payment generation is not implemented.

Owners: [inventory/job costing](./inventory-job-costing-plan.md),
[field-capture costing](./job-costing-from-field-capture-spec.md), and
[Catalog/agreement scope](./catalog-phase-plan.md).
The [office smoke](./validation-playbook.md#run-log) records M9 surface loading
and a labor-cost write. Live multi-user validation remains open; full field
inventory management is deferred.

## Field App And Offline Work

- Assigned-work home and focused job tabs; employee-scoped cached work and
  durable queues for notes, status, equipment, register entries, and media.
- Catalog/truck-stock Add Work composer with duplicate-tap protection;
  tracked-stock capture becomes an auto-costed inventory issue on sync.
- Image/video capture or pick, app-owned staging, size guards, upload-intent
  replay, blob finalization, deterministic rejection handling, and cleanup after
  successful sync.
- Manual and in-screen background sync, per-operation progress persistence, and
  conflict/rejected work preservation. Ordinary session expiry preserves
  unsynced work for the same employee; revoked/inactive access clears local
  field data. Another employee cannot inherit or replay the prior user's queue.

[Offline sync](./offline-sync.md) owns the contract.
[Field smoke evidence](./field-mobile-smoke.md#run-log) records Galaxy Tab proof
for login, caching, manual/background sync, conflicts, register capture, media
upload, revoked-session cutoff, and employee queue isolation. Media transient
retry/partial-success and broader repeated-failure device evidence remain open.
These local Expo/device results do not qualify a sold install's network setup.

## Security, Administration, And Support

- First-owner setup; employee/role management, permission overrides, password
  reset, and session revocation; backend permission checks on protected actions.
- Database-backed login/setup throttling, minimum password length for new
  passwords, absolute session expiry, and production configuration validation.
- Permission-gated History, fixed Reports, System diagnostics, backup/license
  status, and locally downloaded support exports that omit secrets and customer
  payloads by default.
- Architecture, source-size, UI-copy, secret-scanning, and dependency-audit
  checks; tracked migrations and production-mode release/service guards.

Owners: [permissions](./permissions-model.md),
[engineering standards](./engineering-standards.md),
[architecture guardrails](./architecture-guardrails.md), and
[security policy](../SECURITY.md).

## Delivery, Licensing, And Self-Hosted Operations

- **Customer delivery:** BellField-operated estimate/invoice PDF email with
  audit history, queued retries, expiry, cancellation, and delivery-status
  polling. Version-pinned customer acceptance links record approve/decline
  decisions through relay poll/ack. Invoice email can optionally include a
  payment link; online-payments setup is available from office Settings.
- **Relay:** separate service/database, per-shop revocable tokens and binding,
  idempotent sends, quotas/suppression, signed provider webhooks, operator CLI,
  and credentialed release downloads. The documented deployment is the testing
  relay; live-relay evidence is distinct from sold-shaped production proof.
- **Windows install:** release assembly, runner-first preparation, unified
  server config, bundled PostgreSQL, service manifests, LAN configuration and
  evidence, health checks, and first-owner setup.
- **Backup/license/update:** scheduled database/media/license backup sets and
  history, source-release/nonsecret recovery metadata, replacement-config
  generation with fresh secrets/identity, restore release guards,
  retention/freshness visibility, packaged restore, signed offline
  licenses, signed update verification and window enforcement, pre-update
  backups, staged swaps/migrations, durable evidence, and preserved rollback
  releases.

Owners: [customer communications](./customer-comms-and-delivery.md),
[relay design](./delivery-relay-plan.md),
[acceptance links](./acceptance-links-design.md),
[install runbook](./install-runbook.md), [restore runbook](./restore-runbook.md),
[license design](./license-design.md), and
[release operator route](./release-operator-route.md).

**Recorded clean-machine boundary:**
[rerun 30](./gate-day-clean-windows-smoke-2026-07-08-rerun-30.md) passed Gates 1–3:
clean install/reboot/second-device access, backup/restore, and the installed
`.55` to `.56` update with healthy services after reboot. The evidence is bound
to those artifacts; it does not qualify every later commit. Its restore-marker
readback limitation is recorded in that report.
Gate 4 expired-window refusal and Gate 5 sold-shaped production-relay acceptance
remain open, as do broader second-office-desktop and Android field-device
validation against the installed server. The
[Gate Day checklist](./gate-day-checklist.md) owns the procedures; dated reports
own the results.

## Remaining Scope And Where To Resume

- Existing reliability/scale work: device transient-failure evidence, live
  multi-user M9 smoke, and pagination/bounded loading beyond CRM intake and the
  shipped job/bookkeeping queues. The
  [dated gap analysis](./fsm-gap-analysis-2026-07-14.md) is context to recheck
  against code before choosing a slice.
- Deferred capabilities: field estimate builder, unsold-estimate/owner-attention
  worklists, booking/reminder/on-my-way email, optional SMS, GPS/time tracking,
  route optimization, week-view polish, live sockets, stored cards, and a
  customer portal.
- Deployment expansion: managed remote access and guided Tailscale are tracked
  in the [remote-access plan](./remote-access-plan.md); dedicated Windows Server
  and Linux/Docker packaging are tracked in the
  [server-build plan](./server-build-plan.md). Hosted SaaS remains future scope.

Use the [feature roadmap](./milestone-implementation-plan.md) and
[sellability plan](./sellable-product-execution-plan.md) for sequencing, with
[launch readiness](./launch-readiness.md) for unresolved release gates. Owner
direction determines which bounded slice comes next.
