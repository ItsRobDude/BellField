# Milestone 10 — Trust / Admin Foundation Plan

M10 is **not** one big "reports" feature. It is several **boring, read-heavy modules** that make
BellField auditable, manageable, supportable, and trustworthy in day-to-day office use. Admin
**writes** stay in the domain that already owns them (identity-access owns employees/roles/devices).

This doc locks ownership, the slice order, and the exact contents/permissions/privacy of the first
slice **before code**. Later slices are sketched and will be locked in their own pass.

---

## 1. Code shape and ownership

No generic "admin" or "operations" junk drawer. Clear module ownership:

| Module                                                           | Owns                                                                                                | Kind                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| **`system-diagnostics`** (api)                                   | health/readiness: DB reachable, migration version, media root R/W, app version/build, server time   | read-only            |
| **`support`** (api)                                              | support export bundle (status snapshot + non-secret config summary), privacy-conscious, local-first | read-only            |
| **`history`** (api)                                              | cross-record activity/audit read model unioning existing timelines/ledgers                          | read-only            |
| **`reporting`** (api)                                            | fixed business reports as read-only SQL projections                                                 | read-only            |
| **`identity-access`** (api, existing)                            | employee active/inactive, role/permission review, device/session revoke, password reset             | **writes stay here** |
| **company-data / invoices / inventory / job-costing** (existing) | delete/archive/void hardening lives in the domain that owns the record                              | **writes stay here** |

**Office UI:** separate top-level surfaces — **System**, **Reports**, and later **History**. Each is
its own component (`OfficeSystemSurface`, `OfficeReportsSurface`, …). Do **not** grow
`office-workspace-shell.tsx` beyond minimal nav wiring (it is at 879 lines against a 1159 baseline —
keep surface logic inside the surface components).

**Office API client:** one domain file per area in `apps/office-web/src/lib`
(`system-diagnostics-api.ts`, `reporting-api.ts`, `history-api.ts`). Do **not** inflate
`operations-api.ts` (already 1073, at baseline).

**Contracts:** one file per domain in `packages/contracts/src` + barrel export
(`system-diagnostics.ts`, `reporting.ts`, `history.ts`). `platform-health.ts` keeps the existing
basic public `HealthStatus`/`VersionInfo`; the richer owner-gated diagnostics live in
`system-diagnostics.ts`.

**Hard rule:** no configurable report builder in M10. Ship **fixed**, useful reports with
backend-owned, **tested totals**.

---

## 2. Slice order

1. **Diagnostics + Support Export** ← first (this doc locks it)
2. History / Audit read model
3. Fixed Reporting
4. Owner/Admin controls (identity-access)
5. Delete / Archive hardening
6. Inactive / Archive polish

Each slice lands independently with the validation gate in §7.

---

## 3. Permissions (grounded in the existing model)

Permission keys are `area:action` over 18 areas × 8 actions
(`packages/contracts/src/identity-access.ts`). Reuse what exists — **no new permission areas** for
M10 unless a slice genuinely needs one.

| Surface / capability             | Gate (existing key)                           | Who has it (default roles)                                                                     |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| System diagnostics (read status) | `supportLogsBackups:view`                     | Owner, Admin                                                                                   |
| Support export (download bundle) | `supportLogsBackups:export`                   | Owner, Admin                                                                                   |
| Reports surface (read reports)   | `reports:view`                                | Owner, Admin, Dispatcher, BookKeeping (+ export: `reports:export` → Owner, Admin, BookKeeping) |
| History surface (read audit)     | `history:view` (NEW dedicated area — see §5b) | Owner, Admin only                                                                              |
| Employee/role/device admin       | `employeesPermissions:view` / `:configure`    | Owner (full: + create/edit/delete), Admin (view/configure)                                     |

In the default templates, `supportLogsBackups:view` and `:export` belong to **adminCore** (Owner +
Admin); only `:configure` is **Owner-only**. So the System/Support surfaces gate on `view`/`export`
(Owner + Admin) with no new permission plumbing. M10 does not tighten the role template — Admin
having diagnostics/export access fits its "broad operational control" role.

---

## 4. Privacy rules (apply to every M10 read module)

- **No customer/job/business payloads by default** in diagnostics or the support export. Status,
  config presence, versions, counts, timings — never names, addresses, dollar amounts, notes.
- **No secrets, ever.** The config summary reports the _presence_ and _non-secret value_ of settings
  (NODE_ENV, port, media-root path, max upload bytes, DB host/db-name) — never `DATABASE_URL`
  credentials, `BELLFIELD_MEDIA_TOKEN_SECRET`, or any token.
- **Local-first.** Support export is a download the owner saves locally; nothing is sent anywhere.
- Reporting and history may show business data, but only to roles already permitted to see it, and
  only through read-only projections (no mutation, no derived cost from price — the M9 rule holds).

---

## 5. Slice 1 — Diagnostics + Support Export (LOCKED)

The smallest valuable trust slice: let an owner or admin answer "is BellField healthy?" without a developer,
and export a privacy-safe support bundle. Touches **no** job/invoice/cost write paths.

### 5.1 API — `system-diagnostics` module

`GET /system/diagnostics` — gated `supportLogsBackups:view`, surface `office-web`.

Returns `SystemDiagnosticsResponse`:

```ts
interface SystemDiagnosticsResponse {
  serverTime: string; // ISO now
  app: { name: string; version: string; nodeEnv: string };
  database: {
    reachable: boolean;
    latencyMs: number | null; // time for `select 1`
    error?: string; // sanitized message if unreachable
  };
  migrations: {
    appliedCount: number; // count(schema_migrations)
    latestFilename: string | null; // max id filename
    latestAppliedAt: string | null;
  };
  mediaRoot: {
    path: string; // the configured root (a path, not a secret)
    exists: boolean;
    writable: boolean; // probe: write+delete a temp file under the root
    readable: boolean;
    error?: string;
  };
  checks: Array<{ key: string; ok: boolean; detail?: string }>; // rollup for a simple green/red UI
}
```

Notes:

- DB check: `DatabaseService.query('select 1')` wrapped in try/catch + a millisecond timer. Never
  leak the connection string in the error — map to a generic "database unreachable" string.
- Migrations: read `schema_migrations(filename, applied_at)` (count + latest). Read-only.
- Media R/W probe: write a tiny temp file (e.g. `<root>/.diagnostics-probe-<uuid>`) then read+unlink
  it; report writable/readable/exists; clean up always. Reuse `MediaConfigService` for the root.
- App version: `package.json` `version` (read at build/import); `name` "BellField API"; `nodeEnv`
  from `getApiRuntimeConfig()`. Git SHA/build stamp is **deferred** (no build pipeline yet) — add a
  `BUILD_SHA` env passthrough later without breaking the contract.
- The whole endpoint is best-effort: a failed sub-check sets its `ok=false` + `error`, never 500s
  (so the UI can render a partial-red status). Auth failures still 401/403 normally.

### 5.2 API — `support` module

`GET /system/support-export` — gated `supportLogsBackups:export`, surface `office-web`. Returns a
**JSON** bundle (download) `SupportExportBundle`:

```ts
interface SupportExportBundle {
  generatedAt: string;
  generatedByEmployeeId: string; // who exported it (accountability, not customer data)
  diagnostics: SystemDiagnosticsResponse; // composed from system-diagnostics
  config: {
    // PRESENCE + non-secret values only
    nodeEnv: string;
    port: number;
    databaseHost: string | null; // parsed from DATABASE_URL host:port/db — NO credentials
    databaseName: string | null;
    mediaRootPath: string;
    mediaMaxBytes: number;
    mediaTokenSecretConfigured: boolean; // presence flag, never the value
  };
}
```

- The `support` module imports `SystemDiagnosticsService` for the snapshot (clean ownership: support
  composes, diagnostics computes).
- **Runtime log tailing is deferred:** logs currently go to stdout (`apps/api/src/common/logger.ts`),
  there is no log file to read. Real log export waits until file/rotating logging exists; the doc
  notes this so we don't pretend to ship it. The bundle is still valuable (status + config) today.
- Response sets `Content-Disposition: attachment; filename="bellfield-support-<timestamp>.json"`.

### 5.3 Contracts

New `packages/contracts/src/system-diagnostics.ts` exporting `SystemDiagnosticsResponse`,
`SupportExportBundle` (+ sub-types). Add to the barrel.

### 5.4 Office UI — "System" surface

- Add `'system'` to `OfficeView` (`office-workspace-frame.tsx`).
- New `office-system-surface.tsx` (its own file): renders the diagnostics as simple green/red status
  cards (DB, migrations, media, app/version, server time) with a Refresh button, and — when the
  actor has `supportLogsBackups:export` — a "Download support bundle" button that fetches the export
  and triggers a local file download.
- Nav button **gated** on `effectivePermissions.includes('supportLogsBackups:view')` (Owner + Admin),
  so it is invisible to everyone else. Wire it through the shell with minimal additions (one
  conditional NavButton + one surface render), keeping logic in the surface component.

### 5.5 Office API client

New `apps/office-web/src/lib/system-diagnostics-api.ts`:
`getSystemDiagnostics({ sessionToken, apiBaseUrl })` and
`downloadSupportExport({ sessionToken, apiBaseUrl })` (uses the blob/download helper).

### 5.6 Tests (slice 1)

- API: `system-diagnostics.service` — DB-reachable vs error path (mock `query` to throw), migration
  count/latest mapping, media probe writable vs failure, partial-failure rollup never throws.
- API: controller auth gating (`supportLogsBackups:view` / `:export`, office surface).
- API: `support` export composes diagnostics + parses DATABASE_URL into host/name with **no
  credentials**, and never includes the token secret value (presence flag only).
- Office: `office-system-surface` component test — renders status cards from a mocked response;
  hides the export button without `:export`.
- Browser smoke: the System surface renders against the live API and shows green checks.

---

## 5b. Slice 2 — History / Audit read model (LOCKED)

A read-only, cross-record "who changed what" view for owners/admins. Pure projection over existing
ledgers/timelines — **no new event-write system**.

### 5b.1 Permission — a dedicated `history` area (NEW)

The global audit surface gets its **own** permission area, not a reused one:

- Add `history` to the `PermissionArea` list (contracts `identity-access.ts` + the api types). Only
  `history:view` is meaningful for this read-only surface (the other actions exist by the area×action
  model but go unused, like `reports:configure`).
- Grant `history:view` to **Owner and Admin only** (add to `ownerPermissions` and `adminCore` in
  `default-role-templates.ts`). Deliberately **not** `reports:view` (that also grants Dispatcher /
  BookKeeping, and this surface exposes cross-domain actor/change history including financial/cost
  events) and **not** `supportLogsBackups:view` (record audit is not system diagnostics/backups).
- Domain-local history stays visible through normal domain views; only the **global** audit surface
  is gated by `history:view`.

This is the one new permission area M10 introduces (§3's "no new areas unless a slice needs one").

### 5b.2 API — `history` module

`GET /operations/history` — gated `history:view`, surface `office-web`. Cursor-paginated.

Read-only `UNION ALL` over six sources, each projected to a common shape:

| Source                      | recordType          | actor columns                                  | time          | jobId                                              |
| --------------------------- | ------------------- | ---------------------------------------------- | ------------- | -------------------------------------------------- |
| `job_timeline_entries`      | `jobTimeline`       | `actor_name` (no id)                           | `occurred_at` | `job_id`                                           |
| `register_entries`          | `registerEntry`     | `captured_by_employee_id` + `captured_by_name` | `captured_at` | `job_id`                                           |
| `inventory_movements`       | `inventoryMovement` | `actor_employee_id` + `actor_name`             | `occurred_at` | `job_id` (nullable)                                |
| `job_cost_events`           | `jobCostEvent`      | `actor_employee_id` + `actor_name`             | `occurred_at` | `job_id`                                           |
| `payments`                  | `payment`           | `recorded_by_employee_id` + `recorded_by_name` | `received_at` | `invoices.job_id` (join `invoice_id` → `invoices`) |
| `equipment_history_entries` | `equipmentHistory`  | `actor_name` (no id)                           | `occurred_at` | null (equipment-scoped)                            |

```ts
type HistoryRecordType =
  | 'jobTimeline'
  | 'registerEntry'
  | 'inventoryMovement'
  | 'jobCostEvent'
  | 'payment'
  | 'equipmentHistory';

interface HistoryEntry {
  recordType: HistoryRecordType;
  sourceId: string;
  occurredAt: string;
  actorEmployeeId: string | null; // null where the source only stored a name
  actorName: string | null;
  summary: string; // human-readable, derived server-side
  jobId: string | null;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  nextCursor: string | null;
}
```

- **Filters (query params):** `dateFrom`, `dateTo` (ISO), `actorEmployeeId`, `recordType` (one of the
  union), `jobId`. Payments resolve their job through `invoice_id → invoices.job_id` (a direct,
  existing relationship the payment-history code already uses), so a `jobId` filter covers timeline,
  register, job cost, job-linked inventory movements, **and** payments. Only equipment-history rows
  (equipment-scoped, no job) drop out of a job-filtered view.
- **Ordering + cursor:** `occurred_at DESC, recordType ASC, source_id DESC`. The cursor encodes that
  tuple (opaque base64). `limit` defaults to e.g. 50, capped (e.g. 200). A malformed/tampered cursor
  is rejected with `400` (matches the job-queue cursor contract) rather than silently serving page one.
- **Summary:** built server-side per source (e.g. register → "Register entry added: <description>",
  payment → "Payment recorded"). It must stay privacy-appropriate — it reuses fields already visible
  to a permitted office user; it does not invent or expose anything new.
- **Deferred (follow-up, not v1):** customer/location filters (need record → location → customer
  joins that not every source carries directly) and any free-text search. v1 ships the five filters
  above. (The payment → invoice → job join above is **in** v1 — it is a direct existing relationship,
  not the deferred customer/location work.)

### 5b.3 Contracts + office

- Contracts: new `packages/contracts/src/history.ts` (`HistoryEntry`, `HistoryRecordType`,
  `HistoryResponse`) + barrel.
- Office: a "History" surface (own component) with a filter bar (record-type select, actor select,
  date range) and a cursor-paginated list; nav gated on `history:view`. Per-domain `history-api.ts`
  client. No shell bloat.
- **`jobId` filter is API-only in office v1.** The API supports `jobId` (used programmatically and by
  a future job-scoped history view), but the global History surface intentionally exposes no job
  picker yet — a raw UUID text field would be admin/debug-only ergonomics. A real job selector is a
  follow-up alongside the deferred customer/location filters.
- **Date filters are UTC day-bounds in v1.** The day inputs widen to `T00:00:00.000Z` /
  `T23:59:59.999Z`, while rows display in local time; labels read "From (UTC) / To (UTC)" so operators
  aren't surprised. Treating them as local-day bounds is a future refinement (not a v1 blocker — these
  read as UTC audit bounds).

### 5b.4 Tests + smoke

- API: the union maps each source's actor/time/jobId correctly; filters apply (date, actor,
  recordType, jobId); cursor pagination returns a stable next page; `history:view` gate (Owner/Admin
  200, Dispatcher/BookKeeping/Technician 403).
- Office: History surface renders entries from a mocked response; filter changes refetch.
- Live + browser smoke against real ledger rows.
- Migration: none (read-only over existing tables); the permission-area change is data/templates, but
  confirm existing employees' effective permissions resolve (owner/admin gain `history:view`).

---

## 5c. Slice 3 — Fixed Reporting (LOCKED)

A fixed **Reports** surface backed by read-only API projections. No report builder, no editable
report definitions, no new accounting math invented in the UI or the report layer — every number is
**reused** from an existing, tested calculation.

### 5c.0 Confirmations (locked)

- **Current-state snapshots, not as-of history.** v1 reports reflect the live current state ("what is
  owed / costed / on hand right now"). No "as of any past date" accounting. Each response carries a
  `generatedAt` stamp; that is the only time dimension.
- **No schema changes for v1.** Every projection reads existing tables (`invoices`, `payments`,
  `jobs`, `customers`, `job_cost_events`, `job_cost_snapshots`, `inventory_movements`,
  `inventory_items`, `inventory_locations`). No migration.
- **No "low stock" report.** `inventory_items` has **no** reorder / minimum / maximum / par-level /
  threshold column (confirmed: columns are `id, sku, name, kind, unit_of_measure, default_unit_cost,
description, is_active, created_at, updated_at`). Low-stock is deferred until a threshold model
  exists. **Truck stock** is representable today by filtering `inventory_locations.kind = 'truck'`
  (kinds: `warehouse | truck | other`) — not a separate field-app concept.
- **No cost or revenue math is duplicated.** AR + profitability revenue reuse the bookkeeping
  open-balance CTE; profitability cost reuses the M9 rollup/snapshot; valuation reuses the inventory
  on-hand projection. The report layer only _aggregates totals_ over rows it did not compute.

### 5c.1 Permission matrix (the gates are NOT redundant)

Primary gate `reports:view` via `getAuthorizedEmployee(token, 'reports:view', ['office-web'])`, then a
**secondary `effectivePermissions.includes(...)` check** per report (throw `ForbiddenException` if
missing). Export adds `reports:export`. Derived from `default-role-templates.ts`:

| Capability          | Gate                               | owner | admin | dispatcher | bookKeeping | csr / tech |
| ------------------- | ---------------------------------- | :---: | :---: | :--------: | :---------: | :--------: |
| Reports surface     | `reports:view`                     |  ✅   |  ✅   |     ✅     |     ✅      |     ❌     |
| AR / Open Balances  | `reports:view` + `invoices:view`   |  ✅   |  ✅   |     ✅     |     ✅      |     ❌     |
| Job Profitability   | `reports:view` + `jobCosting:view` |  ✅   |  ✅   |     ❌     |     ✅      |     ❌     |
| Inventory Valuation | `reports:view` + `inventory:view`  |  ✅   |  ✅   |     ❌     |     ❌      |     ❌     |
| Export (any report) | above + `reports:export`           |  ✅   |  ✅   |     ❌     |     ✅      |     ❌     |

So dispatcher sees the surface with only the AR card and no export; bookKeeping gets AR + profitability

- export but not inventory; owner/admin get everything. This matrix is pinned by tests.

### 5c.2 Slice 3A — Reporting foundation + AR/Open Balances

- New: `packages/contracts/src/reporting.ts` (+ barrel), `apps/api/src/modules/reporting/*`
  (`reporting.module.ts`, `reporting.controller.ts`, `reporting.service.ts`),
  `apps/office-web/src/lib/reporting-api.ts`, and an `OfficeReportsSurface`.
- Endpoint: `GET /operations/reports/ar-open-balances` → `ArOpenBalancesReport` (see contract).
- **Reuse rule:** extract the billed/paid CTE + select currently inlined in
  `BookkeepingRepository.listOpenBalances(limit)` (`bookkeeping.repository.ts:90`) into a shared,
  un-limited `listOpenBalanceRows()` method. `listOpenBalances(limit)` keeps its `limit $1` by
  wrapping it; the report calls the un-limited variant and sums totals. One source of truth for:
  posted main + adjustment increase billed; posted credit reduces billed; non-void payments reduce
  amount due; void payments excluded; rows only where `amountDue > 0`; `roundMoney` everywhere.
- Totals: `jobCount = rows.length`, and column sums of `netBilled` / `paidTotal` / `amountDue`
  (these are open-AR totals — sums across the `amountDue > 0` rows by definition).

### 5c.3 Slice 3B — Job Profitability

- Endpoint: `GET /operations/reports/job-profitability` → `JobProfitabilityReport`.
- Gate: `reports:view` + `jobCosting:view`.
- **Revenue** = posted invoices only (`main + adjustment − credit`) — the same billed CTE as AR,
  reused, never invoice-line `unitCost`.
- **Cost** = the M9 rollup/snapshot: if a current frozen snapshot exists use `getCurrentJobCostSnapshot`
  (cost is frozen and was complete at freeze time), else `computeJobCostRollup`
  (`job-cost-rollup-utils.ts`) → `materialCost` / `laborCost` / `expenseCost` / `totalCost` /
  `unresolvedLineCount` / `costComplete`. **`isFinalized` means the cost came from a current frozen
  snapshot** (`getCurrentJobCostSnapshot(jobId) !== null`), i.e. read rather than recomputed live — not
  a function of `status`. (A reopened job supersedes its snapshot, so it correctly reverts to the live
  rollup with `isFinalized = false`.)
- `marginBasisPoints`: **`null`** when revenue is 0 **or** `costComplete = false` (v1 prefers null over
  a misleading partial margin); else `round(profit / revenue * 10000)`. The UI labels incomplete rows.
- Totals: `jobCount`, summed `revenue` / `knownCost` / `knownProfit`,
  `incompleteJobCount = count(costComplete === false)`, `unresolvedLineCount = Σ row.unresolvedLineCount`.
- **DECIDED: row scope = jobs with ≥1 _posted_ invoice (any kind, incl. a posted $0 invoice).**
  Revenue recognition defines the population. The scope predicate is "has at least one posted invoice",
  **not** `net_billed > 0` — a warranty / no-charge job with a posted **zero-dollar** invoice still
  appears (revenue 0, real cost, negative profit, `marginBasisPoints = null`). Costed-but-uninvoiced
  jobs are **deferred to a separate future WIP / unbilled-cost-exposure report**, never mixed into
  profitability.
- **DECIDED: v1 loops per job for cost (N+1), reusing the rollup/snapshot path.** `computeJobCostRollup`
  / `getCurrentJobCostSnapshot` stay the single source of truth — we will **not** duplicate cost math
  in reporting SQL. Revenue is one set-based query; cost is a bounded per-job loop over the
  posted-invoice job set. If report performance ever becomes a real problem, extract a shared batch
  rollup helper **from the same source logic** rather than writing a second independent calculation.

### 5c.4 Slice 3C — Inventory Valuation

- Endpoint: `GET /operations/reports/inventory-valuation` → `InventoryValuationReport`.
- Gate: `reports:view` + `inventory:view`.
- **Reuse rule:** `InventoryRepository.getOnHand()` (`inventory.repository.ts:195`) already returns
  exactly `{ itemId, itemName, itemKind, locationId, locationName, quantity, averageUnitCost,
totalValue }` company-wide, weighted-average from `inventory_movements.extended_cost`, excluding
  zero balances. The report calls it (or its extracted query) and adds totals — no new cost math.
- Totals: `rowCount = rows.length`, `totalQuantity = Σ quantity`, `totalValue = Σ totalValue`.
- Zero balances stay excluded (no product reason to show them). No low-stock. Truck-only is a
  `location.kind === 'truck'` filter, deferred unless asked.

### 5c.5 Office UI

- Top-level **Reports** nav gated by `reports:view`; logic in `office-reports-surface.tsx`, minimal
  shell wiring (mirrors the History slice). No in-surface report builder.
- Fixed report cards / simple selector: AR/Open Balances always; Job Profitability only with
  `jobCosting:view`; Inventory Valuation only with `inventory:view`.
- **Export is server-side and server-gated.** Each report has a sibling `GET .../<report>/export`
  endpoint that returns CSV (`text/csv` + `Content-Disposition`), gated on the report's view
  permissions **plus `reports:export`** — a user who can view a report still gets a `403` on export
  without `reports:export`. The office button (gated the same way in the UI) just downloads the blob;
  the permission is enforced on the server, not UI-only. (Decided in review: `reports:export` is a real
  permission, so it must be enforced server-side.)
- Incomplete profitability rows show a visible **"Cost incomplete"** badge with the unresolved line
  count.

### 5c.6 Tests + smoke

- API: AR totals across posted main / adjustment / credit / payment / void payment; AR excludes
  fully-paid & overpaid jobs; profitability revenue drops for credits; profitability uses the rollup
  and flags incomplete cost; profitability 403 without `jobCosting:view`; valuation matches
  weighted-average on-hand; valuation 403 without `inventory:view`; export 403 without `reports:export`.
- Office: Reports nav visible with `reports:view`; profitability card hidden without `jobCosting:view`;
  inventory card hidden without `inventory:view`; incomplete-cost badge renders; export hidden without
  `reports:export`.
- Live + browser smoke against the reseeded ledger.

---

## 6. Later slices (sketch — locked in their own pass)

- **History / Audit read model:** locked — see §5b.
- **Fixed Reporting (read-only projections, tested totals):** locked — see §5c.
- **Owner/Admin controls (identity-access writes):** employee active/inactive review, role/permission
  review, lost-device/session revoke (if the session model supports it), password reset (if auth
  supports it cleanly), admin-only review surface in office.
- **Delete / Archive hardening:** shared server-side confirmation patterns for destructive actions —
  explicit confirm token/phrase where appropriate, optional reason on sensitive void/delete/archive,
  a timeline/history entry for the action. No UI-only safety theater.
- **Inactive / Archive polish:** active/inactive filters where the model already supports it; keep
  inactive records findable from history but out of normal active workflows.

---

## 7. Validation gate (every slice)

- focused API tests (Jest)
- office component tests when UI changes (Vitest + Testing Library)
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm check:file-size`
- `pnpm format:check`
- browser smoke for any new office surface
- migrations (if any) round-trip up/down/up

---

## 8. Open decisions to confirm before/while building slice 1

1. **Module split:** two api modules (`system-diagnostics` computes, `support` composes the export)
   vs. one `system-diagnostics` module owning both endpoints for now. This doc assumes **two** to set
   the clean-ownership pattern early; say the word to fold into one for slice 1.
2. **Disk-free-space check:** omitted from v1 (portable disk-usage in Node is fiddly and OS-specific).
   Media R/W probe covers the "can we store files" question. Add a disk gauge later if it earns its
   keep.
3. **History permission key:** slice 1 doesn't need it; flagged here so we decide in the History
   slice whether to reuse `reports:view` or add an audit-specific key.
