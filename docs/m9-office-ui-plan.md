# Milestone 9 — Office UI Plan (Inventory, Purchasing, Job Cost)

The M9 backend (B1–B6 + corrections) is shipped. This is the office-web surface pass.

## Hard constraints

- **Visual + structural parity** with existing office surfaces is mandatory. Reuse
  `officeWorkspaceStyles` exclusively (no new CSS); mirror two proven exemplars:
  - read lists → `office-workspace-bookkeeping-surface.tsx` (QueuePanel/row/badge pattern)
  - forms + writes → `job-invoice-corrections.tsx` (draft state, save handler, notice/error)
- **SPA nav model** (no file routing): extend the `OfficeView` union + add `NavButton`s in
  `office-workspace-frame.tsx`; render in `office-workspace-surfaces.tsx`; wire data +
  permission booleans + `sessionToken`/`apiBaseUrl` + `onOpenJob` through
  `office-workspace-shell.tsx`.
- **API access** only via `operations-api.ts` `requestJson`; response/request types come from
  `@bellfield/contracts` (the architecture guard forbids redeclaring contract types in client
  helpers).
- **Permission gating** in the UI mirrors the backend gates (`inventory:*`, `purchasing:*`,
  `jobCosting:*`); the backend still enforces. Hide nav/actions the user can't use.
- **Money/date** via existing `formatCurrency` (job-invoice-shared) and the dispatch date
  helpers — no new formatters.
- **Per slice:** office-web `typecheck` + `lint` + `test` (vitest) + `build` green; new
  `operations-api` client functions covered by vitest fetch-mock tests (mirroring
  `operations-api.test.ts`); commit + push; Codex review; address findings.

## Refinements from Codex review

- **No in-surface tabs** on top-level surfaces. Existing top-level surfaces use stacked
  `workspacePanel`/`panel` sections; tabs exist only in `JobDetailPanel`. Inventory and
  Purchasing are stacked panels, not tabbed.
- **Split UI-4** into UI-4A (create + order) and UI-4B (receive) — two complex forms in one
  slice is too much for one review.
- **Name the source state** for selectors (don't leave implicit):
  - Inventory write forms reuse the active items + locations loaded by UI-1.
  - Issue-to-job's job selector + create-PO's customer-location/job selectors load on demand
    from `getOfficeJobsWorkspace` (returns `locations` + `jobs`); create-PO inventory
    destinations come from the inventory locations list.
- **UI-5 job-detail tab wiring** (it is NOT a top-level surface): tab union in
  `job-work-types.ts`, tab list + gate + active render in `job-detail-panel.tsx`, `initialTab`
  threaded via `office-workspace-job-detail-surface.tsx` and `office-workspace-shell.tsx`.
  Gotcha: gate the `jobCost` tab on `jobCosting:view` and never open the detail directly to a
  permission-hidden tab (it would render blank).
- Tables only via `tableWrap/table/tableHeadCell/tableCell` (mirror `job-estimates-section.tsx`).
  No new CSS.

## Slices (each shippable + reviewed)

### UI-1 — Inventory surface, read views (nav "Inventory", gate `inventory:view`)

One surface, stacked panels (no tabs): **On-hand**, **Items**, **Locations**, **Movements**.

- On-hand table: item, kind, location, quantity, weighted-avg unit cost, total value.
- Items table: sku, name, kind, unit of measure, default unit cost, active.
- Locations table: name, kind, assigned employee, active.
- Movements ledger (recent, newest first; optional item filter): occurredAt, item, kind, qty,
  unit cost, location, job, actor, note.
- Client fns: `getOfficeInventoryItems`, `getOfficeInventoryLocations`, `getOfficeInventoryOnHand`,
  `getOfficeInventoryMovements`.

### UI-2 — Inventory write actions (gates `inventory:create`/`inventory:edit`)

- Create/edit item; create/edit location.
- Adjustment form (item, location, quantityDelta signed, unitCost?, note).
- Transfer form (item, from, to, quantity, note).
- Issue-to-job form (item, location, jobId, quantity, note).
- Each action refreshes on-hand; action buttons gated on perms.
- Client fns: create/update item + location, `createOfficeInventoryAdjustment`,
  `createOfficeInventoryTransfer`, `issueOfficeInventoryToJob`.

### UI-3 — Purchasing surface, read (nav "Purchasing", gate `purchasing:view`)

- PO list (summaries): poNumber, vendor, status pill, destination name, expected total, line count.
- PO detail: header fields + lines table (kind, description, qty, expected unit/line cost,
  equipment fields); status; action slots (filled in UI-4).
- Client fns: `listOfficePurchaseOrders`, `getOfficePurchaseOrder`.

### UI-4A — Purchasing: create PO + order (gates `purchasing:create`/`purchasing:edit`)

- Create PO form: vendor, single destination (inventory location XOR customer location),
  optional job, line editor (add/remove; part vs equipment fields; equipment qty fixed at 1;
  equipment on a customer+job PO needs a catalog item — backend rules at
  `purchasing.service.ts` create-validation).
- Order action (draft → ordered).
- Source state: inventory locations (UI-1) + customer locations/jobs (`getOfficeJobsWorkspace`).
- Client fns: `createOfficePurchaseOrder`, `orderOfficePurchaseOrder`.

### UI-4B — Purchasing: receive (gate `purchasing:edit`)

- Receive form on an ordered PO: per-line actual qty/cost + equipment `serialNumber`;
  `confirmMissingSerial` toggle when an equipment serial is blank.
- Client fn: `receiveOfficePurchaseOrder`.

### UI-5 — Job Cost tab (in job detail, gate `jobCosting:view`)

- New tab on the job detail view: rollup cards (material/labor/expense/total), the `finalized`
  snapshot (badge + frozen total) when present, and the `events` table including reversals.
- Post labor (description, hours, ratePerHour) / expense (description, amount) — gate
  `jobCosting:create`.
- Reverse a non-reversal event — gate `jobCosting:edit`; confirm + optional reason; a reversal
  row is shown inline and cannot itself be reversed.
- Material detail links to the inventory movements for the job (`GET …/movements?jobId=`).
- Client fns: `getOfficeJobCosting`, `postOfficeJobLabor`, `postOfficeJobExpense`,
  `reverseOfficeJobCostEvent`.

## Out of scope (v1 UI; document, don't build)

PO close/vendor master, partial receipts, inventory in the field app, bulk operations, CSV
export, charts. Receive is full-PO (matches the backend).

## Risk notes

- Create-PO and Receive are the most complex forms (multi-line, conditional equipment fields);
  keep them functional and consistent, not fancy.
- UI-5 requires locating the job-detail tab host and adding a tab without disturbing existing
  tabs; gate the tab on `jobCosting:view`.
- Surface props flow through `office-workspace-shell.tsx`; keep new props minimal
  (sessionToken, apiBaseUrl, permission booleans, onOpenJob).
