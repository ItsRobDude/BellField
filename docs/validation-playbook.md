# BellField Validation Playbook

This playbook defines how to prove risky BellField lanes without pretending every check belongs in CI.

BellField is self-hosted-first and Windows-friendly, so validation has three layers:

- fast checks that should stay routine
- local DB/API smoke checks that mutate only disposable development data
- browser and device smoke checks that produce dated evidence

Generated evidence should live under `artifacts/validation/<timestamp>/`. That folder is ignored by git so large screenshots and logs do not churn the repo; promote only intentionally curated evidence.

## Fast Repo Checks

Run these before handing off broad backend or office work:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm check:architecture
pnpm check:ui-copy
pnpm format:check
pnpm security:secrets
pnpm security:audit
```

For narrow changes, run the focused package checks first, then widen if the change touches shared contracts, shared UI, migrations, or financial/history behavior.

## Local Database Setup

Use the local PostgreSQL helper and tracked migrations:

```powershell
pnpm dev:postgres
pnpm dev:migrate
pnpm dev:api
```

The default local API target is `http://localhost:3001`.

## M9 API Smoke

The M9 smoke runner proves the inventory, purchasing, and job-costing workflow through real API endpoints against the local API.

```powershell
pnpm smoke:m9
```

What it verifies:

- office admin login
- job creation
- inventory item and stock location creation
- adjustment, transfer, and issue-to-job
- labor and expense cost events
- inventory-destination PO create, order, receive
- customer/job-destination PO create, order, receive
- job-cost rollup includes material, labor, and expense
- job completion freezes a finalized cost snapshot
- finalized jobs reject labor, expense, reversal, issue-to-job, and PO receive-to-job writes

Safety rules:

- The runner refuses non-local API targets by default.
- Override the API target with `BELLFIELD_API_BASE_URL` or `--api-base-url=...`.
- Pass `--allow-non-local` only for an intentionally disposable environment.
- Evidence is written to `artifacts/validation/<timestamp>/m9-api-smoke.json`.

## Jobs Lifecycle API Smoke

The jobs smoke runner proves the jobs/appointments lifecycle through real API endpoints
against the local API. It is the live-DB companion to the `jobs-data` repository split and the
standalone `createAppointment` transaction hardening.

```powershell
pnpm smoke:jobs
```

What it verifies:

- office admin login
- create a job with an initial appointment (opens `scheduled`)
- create a job with no appointment (opens `new`), then add an appointment (standalone
  createAppointment path, which opens its own transaction) and confirm it promotes to `scheduled`
- job detail reads return the appointment and timeline history after those writes
- complete a job (freezes the finalized cost snapshot), then reopen it (supersedes the snapshot)
- technician sign-in and assigned-work read returns a job scheduled for today

Safety rules match the M9 smoke: the runner refuses non-local API targets by default
(override with `BELLFIELD_API_BASE_URL` / `--api-base-url` and `--allow-non-local` only for a
disposable environment). Evidence is written to
`artifacts/validation/<timestamp>/jobs-lifecycle-api-smoke.json`.

## Office Browser Smoke

Use browser smoke for UI behavior that component tests cannot honestly prove.

Start the API and office app:

```powershell
pnpm dev:api
pnpm dev:office-web
```

Suggested office smoke evidence:

- Dispatch: date picker, Today, previous/next, refresh, schedule edit, status edit, job detail open.
- Inventory: on-hand panel loads, movement list loads, adjust, transfer, issue-to-job, item/location create or edit.
- Purchasing: PO list/detail loads, create draft PO, mark ordered, receive ordered PO.
- Job Cost tab: live rollup loads, labor/expense post, event reversal, finalized-state controls disabled after completion.

Capture screenshots under `artifacts/validation/<timestamp>/office/` with names that describe the state being proven, for example `dispatch-schedule-edit.png` or `job-cost-finalized-lock.png`.

## Field Device Smoke

Use [field-mobile-smoke.md](./field-mobile-smoke.md) for the Android/Expo workflow.

Do not replace real-device proof with unit tests. The field lane needs device evidence for:

- sign-in and assigned-work load
- offline queueing
- manual Sync Now
- media capture or pick
- media upload-intent replay and raw blob finalization
- retry after transient API/blob failure
- staged-file cleanup after successful upload

Capture screenshots and any concise notes under `artifacts/validation/<timestamp>/field/`.

## Completion Standard

A lane is ready to call closed only when the evidence names the commit, local API target, commands run, and any skipped checks. If a smoke cannot support a strong conclusion, say that plainly in the evidence note instead of rounding it up to a pass.
