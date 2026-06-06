# Maintainability Refactor Plan

This document tracks BellField's intentional refactor work.

The goal is not to make the codebase abstract.
The goal is to keep BellField readable while the product grows.

Refactors in this plan should be behavior-preserving unless they are paired with a named, reviewed product or UX fix.

---

## Current Rule

BellField treats large source files as a review signal and very large source files as maintenance debt.

Executable check:

```powershell
pnpm check:file-size
```

The check applies to non-test TypeScript source under `apps/` and `packages/`.

Rules:

- New source files at `800+` lines fail unless they are deliberately added to the baseline.
- Source files at `1200+` lines are a blocking maintenance smell unless there is a narrow documented reason.
- Existing oversized files are baseline-locked in `tools/check-file-size.mjs`; they may shrink, but they should not grow.
- Tests, migrations, and docs are reviewed with judgment instead of this source-file guard.

When a file trips the guard, prefer the boring fix:

- extract a focused rendering component
- extract a pure formatting or mapping helper
- split data access by read model or command
- split contract groups by product domain

Do not replace one large file with one large hook or one vague shared utility.

---

## Baseline Snapshot

Current non-test source snapshot when this plan was created:

| Metric                       | Count |
| ---------------------------- | ----: |
| Source TS/TSX files          |   205 |
| Source files at `300+` lines |    51 |
| Source files at `500+` lines |    21 |
| Source files at `800+` lines |    10 |

Current oversized baseline:

| Lines | File                                                                  | Refactor direction                                                                          |
| ----: | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
|  1355 | `apps/office-web/src/modules/operations/crm-panel.tsx`                | Split customer/location/contact sections and search/detail state.                           |
|  1205 | `apps/api/src/modules/jobs-appointments/jobs-appointments.service.ts` | Split job commands, appointment commands, status transitions, and closeout/follow-up rules. |
|  1159 | `apps/office-web/src/modules/operations/office-workspace-shell.tsx`   | Split workspace state/actions by surface and keep shell as orchestration.                   |
|   855 | `apps/office-web/src/modules/operations/job-detail-panel.tsx`         | First appointments split completed; continue splitting remaining tab sections when touched. |
|  1073 | `apps/office-web/src/lib/operations-api.ts`                           | Split API helpers by domain and keep compatibility exports.                                 |
|   963 | `apps/api/src/modules/invoices/invoices.repository.ts`                | Split posting/line/balance/correction persistence helpers.                                  |

The baseline is intentionally strict: these files are allowed to remain temporarily oversized, but not to keep growing.

---

## Execution Order

### Slice 1 - Job Detail Appointments

Purpose:

- fix the confusing always-visible blank appointment form
- isolate appointment rendering/editing from the broader job detail panel
- reduce pressure in `job-detail-panel.tsx`

Status: shipped as the first cleanup slice.

Implementation shape:

- extracted a focused appointments section component
- kept existing backend/API behavior
- collapsed new appointment fields behind an explicit `Add appointment` action
- kept save/status interactions tested

Validation:

```powershell
pnpm --filter @bellfield/office-web test -- job-detail-panel
pnpm --filter @bellfield/office-web test -- office-workspace-shell
pnpm --filter @bellfield/office-web lint
pnpm check:file-size
```

### Slice 2 - Office Workspace Shell Action Boundaries

Purpose:

- keep `office-workspace-shell.tsx` from becoming the permanent owner of every workflow action
- separate surface-specific async handlers and notices from the top-level shell where practical

Implementation shape:

- extract narrow action helpers by workflow area only when touched
- keep cross-surface refresh orchestration explicit
- avoid a single giant `useOfficeWorkspaceState` hook

Validation:

- office-web tests for touched workflows
- office-web typecheck/lint
- `pnpm check:file-size`

### Slice 3 - API Job Persistence Split

Purpose:

- make job persistence easier to review before more history/reporting work lands

Status: shipped. `jobs-data.repository.ts` went from 1738 lines to a 319-line delegating
facade and dropped off the oversized baseline entirely.

Implementation shape:

- split `jobs-data.repository.ts` by behavior group without changing public service contracts:
  - `jobs-data-row-mappers.ts` — pure row types + record/message mapping helpers (no DB access)
  - `jobs-read-data.repository.ts` (`JobsReadDataRepository`) — every non-mutating read model + `hydrateJobs`
  - `jobs-command-data.repository.ts` (`JobsCommandDataRepository`) — every transactional write + status-derivation helpers, delegating post-write reads to the read repository
  - `jobs-data.repository.ts` (`JobsDataRepository`) — a thin facade preserving the single injection point `JobsDataService` depends on
- transaction ownership stays obvious: all transactions now live in the command repository
- reused the shared `insertJobTimelineEntry` helper, dropping the private duplicate
- no public service contract changed; the repository spec drives the unchanged facade surface

Validation:

- API tests for jobs, appointments, dispatch, register/media, invoices, and job-costing
- `pnpm check:architecture`
- `pnpm check:file-size`

### Slice 4 - Contracts Domain Split

Purpose:

- remove the shared-contract choke point without changing import semantics for clients

Status: shipped. `packages/contracts/src/index.ts` went from 1591 lines to a 16-line barrel
and dropped off the oversized baseline entirely.

Implementation shape:

- moved every declaration verbatim (no renames, no reshaping) into 13 private per-domain
  files: `platform-health`, `identity-access`, `crm`, `equipment`, `jobs`, `dispatch`,
  `media`, `estimates`, `invoices-payments`, `inventory`, `purchasing`, `job-costing`,
  `bookkeeping`
- `index.ts` is now a pure re-export barrel using NodeNext-safe `export * from './x.js'`
  specifiers; the package's public surface is unchanged (clients still import only from
  `@bellfield/contracts` — no subpath exports were added)
- cross-domain references resolve through type-only `import type { ... } from './y.js'` lines
  between the private files
- updated `tools/check-architecture.mjs` so the client-API-type-redeclaration guard collects
  exported interface/type names from all `packages/contracts/src/**/*.ts`, not just `index.ts`
  (which would otherwise miss every name after the split)

Validation:

- `pnpm --filter @bellfield/contracts typecheck`
- `pnpm check:architecture`
- `pnpm check:file-size`
- `pnpm typecheck` (all 8 projects)
- `pnpm test`

### Slice 5 - Field Workspace Screen Split

Purpose:

- lower risk before more real-device field smoke and sync hardening

Status: shipped in two steps. `technician-workspace-screen.tsx` went from 1502 lines to 501
and dropped off the oversized baseline. The render already delegated to extracted tab/home
components from earlier slices; this slice moved the remaining bulk — the offline logic — out:

- step 5a (`field-sync-drain.ts`): the offline-queue replay engine (`runSyncDrain` →
  `drainFieldSyncQueue(ctx, options)`). The screen keeps a thin wrapper, so `syncNow` and the
  background loop are unchanged.
- step 5b (`field-operation-handlers.ts`): the queue handlers (build PendingOperation →
  persist → update state, plus retry/discard and equipment create/link) →
  `createFieldOperationHandlers(deps)`. The screen destructures them into the same names the
  render already used.

Both moves are verbatim: each extracted file destructures its dependency object into the exact
local names the moved bodies already used, so no in-body logic changed. The offline/sync mental
model and the queue/replay business rules stay out of the component, per the plan.

Validation:

- field-mobile tests (106 passing), typecheck, lint
- `pnpm check:file-size` (screen off the baseline)
- manual field smoke run on real hardware (Galaxy Tab S9 Ultra) and **passed** — login,
  assigned-work load, queue (note + appointment status), manual + background sync drain,
  conflict preservation + discard, and the sign-out guard, with the money-path ops verified
  server-side. See the 2026-06-04 entry in [field-mobile-smoke.md](./field-mobile-smoke.md).

---

## Refactor Discipline

Each refactor slice should:

- name the behavior it is preserving
- include tests before or during the move
- split mechanically first, then improve ownership in a separate pass if needed
- avoid broad formatting-only churn in unrelated files
- leave public API contracts unchanged unless the slice explicitly owns contract cleanup
- update this plan when a baseline file is reduced or removed from the oversized list

Stop and reassess if a refactor requires changing product behavior, permissions, persistence semantics, or accounting/history meaning.
