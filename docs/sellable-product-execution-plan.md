# BellField Sellable-Product Execution Plan

This is the controlling execution plan for taking BellField from "runs for
BellField's own shop" to "a stranger can buy it, install it on a Windows
office server, run it for years, and be supported."

It is grounded in a code audit performed 2026-06-10 (branch
`review-fixes-20260610`). Where this plan states "current reality," that was
verified against code, not assumed from docs.

Primary references:

- [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md) — install posture and gates
- [asset-protection-and-licensing.md](./asset-protection-and-licensing.md) — licensing posture (decided)
- [delivery-relay-plan.md](./delivery-relay-plan.md) — relay design (decided)
- [launch-readiness.md](./launch-readiness.md) — the cross-cutting checklist this plan executes
- [customer-comms-and-delivery.md](./customer-comms-and-delivery.md) — comms phases

## How to use this plan

- Phases execute in order; slices inside a phase are ordered but may overlap
  when explicitly marked parallel-safe.
- Work the smallest slice that moves the phase gate. Do not start a later
  phase early just because it looks adjacent.
- Every slice lists acceptance criteria. A slice is not done until they pass.
- Gate rule (owner decision, 2026-06-11): phase gates that require hardware
  the company does not have on hand — a scratch/clean Windows machine for the
  stranger install, the restore drill, reboot survival, and the real
  installed-services updater run — are **tracked validation debt, not
  blockers**. Repo-side work on later phases continues; the open gates are
  listed in §Open validation debt and every one of them must be performed and
  dated before the first sold install or pilot.
- Decisions are tagged `D#` and collected in §Decisions; a slice that names a
  decision is blocked until that decision is recorded here.
- Product-feature work (invoice delivery, dispatch density, reporting polish)
  continues in parallel under
  [milestone-implementation-plan.md](./milestone-implementation-plan.md); this
  plan owns sellability infrastructure only.

## Open validation debt

Environmental gates currently open, all satisfiable in one scratch-machine
session:

- Phase 1: clean-machine stranger install (browser-based owner setup and job
  booking included), service registration, reboot survival
- Phase 2: restore drill onto a scratch machine from a real worker-produced
  backup set
- Phase 4: installed v(N) → v(N+1) update with real services and a real
  pre-update `pg_dump` backup, plus a real refusal against an expired-window
  license
- Phase 5/6: sold-shaped installed release sends an estimate through the
  production relay, opens the customer acceptance page, and applies the
  customer decision back through the worker poller

These must all be performed and dated before the first sold install or pilot.

## Current reality (audited 2026-06-10; Phase 0 applied 2026-06-11; hardening follow-up applied 2026-06-11; Phase 4 repo-side updater foundation applied 2026-06-11)

- Release artifact scaffolding now exists: `tools/build-release.mjs` assembles
  compiled API/worker output, office-web standalone output, migration scripts,
  install helpers, deployed contracts, a release build manifest, signed update
  artifact manifest, updater helper, and a bundled Node runtime into
  `release/`. The office static asset copy now targets the actual standalone
  server root and has a same-machine asset/browser smoke. The clean-machine
  install gate has not yet been run.
- First-user paradox is closed in code: when a fresh database has zero active
  employees, the API logs a one-time first-owner setup token and office-web
  switches to owner-account setup.
- Backup/restore: Phase 2 repo-side foundation now exists. The worker owns a
  scheduled backup job, startup due-check from latest successful backup,
  orphaned-running cleanup, old manifest-less partial-set cleanup, backup run
  history, backup-set retention, and a packaged restore helper with staged
  media/license replacement; the scratch-machine restore gate remains
  unclaimed.
- Update path: repo-side Phase 4 foundation now exists. Release builds are
  stamped with version/release date, System/support read the manifest, release
  artifacts are signed, the updater verifies artifact signature + license
  update window, runs a hard-fail pre-update backup by default, stages/swaps
  release folders, runs migrations, restarts services, and health-checks. A
  scratch same-machine updater smoke passed; the real installed v(N) to v(N+1)
  service update gate remains unclaimed.
- Licensing: Phase 3 repo-side primitive now exists: signed offline license
  file design, API startup verification behind a license-required runtime flag
  or release build manifest, System/support visibility, private issuance
  tooling, v1 key ceremony docs, local-key smoke, and backup/restore coverage
  for the license file.
- `apps/worker`: real DB-backed job-runner footing now exists for heartbeat and
  scheduled backups; Phase 5 can reuse it for delivery retry jobs.
- Live contradictions after Phase 1 repo work: the interim Resend key remains a
  BellField-operated-only bridge until Phase 5, and the release/runbook path is
  not yet clean-machine certified.
- Genuinely ready: explicit seed posture, release-manifest production-mode
  enforcement, production CORS allowlist,
  structured email failure codes, provider-key seam, shared email attachment
  cap, snapshot-at-queue-time semantics, and snapshot read/verify path.

---

## Phase 0 — Contradiction closures and relay prep (completed 2026-06-11)

Small, independent code slices. No installer or licensing dependencies. All
can land on one branch.

Status: completed in this repo. The slice details below are retained as the
implementation record and as regression criteria for future changes.

### 0.1 Seed-data and dev-mode guard

Current: `runtime-config.ts` defaults `bootstrapSeedData` to true whenever
`NODE_ENV` is not `production`, and unset maps to `development`. Production
honors an explicit `BOOTSTRAP_SEED_DATA=true`.

Build:

- flip the default: seeding runs only when `BOOTSTRAP_SEED_DATA=true` is
  explicit, in every environment (`apps/api/src/common/config/runtime-config.ts`)
- production refuses to boot when `BOOTSTRAP_SEED_DATA=true` (aggregate it
  into the existing fail-fast problems list)
- add a System diagnostics check (`system-diagnostics.service.ts`): red when
  any active employee has a `@bellfield.local` email — seeded identities
  visible wherever they exist
- update `dev-setup.md` and both `.env.example`s: dev now sets
  `BOOTSTRAP_SEED_DATA=true` deliberately

Acceptance: API with no env vars boots with an empty employee table and a red
"seeded accounts" check never fires; production boot with seed flag set fails
with a readable error; existing dev flow documented and working.

### 0.2 Production CORS allowlist

Current: `app.enableCors({ origin: true })` unconditionally.

Build: new env `BELLFIELD_OFFICE_ORIGINS` (comma-separated). Production:
required, fail-fast when missing, exact-match allowlist. Dev/test: keep
permissive. Document in `.env.example` and `deployment-model.md`.

Acceptance: production boot without the var fails listing the problem;
cross-origin request from a non-listed origin is refused in production; dev
unchanged.

### 0.3 Structured delivery failure codes

Current: `EmailProviderSendResult` is `sent | notConfigured | error`, and
`estimate-delivery.service.ts` derives the public failure code by string
equality on adapter error copy — the one brittle joint in the relay seam.

Build: result becomes
`{ kind: 'sent', providerMessageId? } | { kind: 'failed', code: OutboundMessageFailureCode, retryable: boolean, message }`
(`notConfigured` folds into `code`). The service persists/derives codes from
the structured value; delete the string comparison. `retryable` is unused
until Phase 5 but defined now so the adapter contract is final.

Acceptance: existing delivery specs pass with assertions on structured codes;
no string-equality mapping remains.

### 0.4 Provider literal out of the call site

Current: `provider: 'resend'` hardcoded in `estimate-delivery.service.ts`.

Build: the adapter exposes its provider key; the service writes
`emailProviderService.providerKey`. Contracts/migration widening to `'relay'`
waits for Phase 5.

### 0.5 Shared attachment-size constant

Current: `15_000_000` inline in `estimate-delivery.service.ts`. A future
relay-side mismatch would strand queued sends for the full expiry window.

Build: `estimateEmailMaxAttachmentBytes` in `packages/contracts`
(document-delivery), consumed by the service; the relay spec references the
same constant.

### 0.6 Snapshot read path

Build: `CustomerDocumentStorageService.readEstimatePdf(storagePath, expectedSha256)`
— read, verify hash, return bytes. Converts snapshot-at-queue-time from
structurally-true to consumable by a deferred retry. Unit-test happy path and
hash mismatch.

### 0.7 Dedupe covers live queued rows — moved to Phase 5.3

Originally scoped here, deliberately moved: blocking duplicates on any live
`queued` row regardless of age is only safe alongside queue expiry and
cancel-while-queued. Before those exist, a hard crash between intent insert
and the failure mark would wedge an estimate-recipient pair forever with no
UI recourse. Long-lived queued rows are a Phase 5 phenomenon anyway — until
retry semantics exist, queued rows live for seconds and today's 60-second
window is correct and self-healing. The dedupe widening lands in 5.3 with its
safety prerequisites.

Phase 0 gate: all slices merged, full suite green, no live contradiction
between code and `deployment-model.md` remains except the interim email key
(closed by Phase 5) and the artifact itself (Phase 1).

---

## Phase 1 — The installable artifact

Goal: one supported install path matching
`self-hosted-installation-strategy.md`. Customer never needs git, Node, pnpm,
Docker knowledge, or a terminal beyond running the installer.

Status: repo-side Phase 1 implementation landed 2026-06-11. This includes
first-owner setup, meaningful health/schema readiness, compiled worker and
office standalone build wiring, release assembly, deployed contracts, release
build manifest, unified server-config template, scoped Windows service
manifests, PostgreSQL provisioning helper, and `docs/install-runbook.md`. A
nondestructive same-machine compiled-release smoke passed on 2026-06-11, with
follow-up office asset/browser proof after release-packaging hardening; see
[phase-1-local-install-smoke-2026-06-11.md](./phase-1-local-install-smoke-2026-06-11.md).
The clean-machine stranger gate remains deliberately unclaimed because only
machines with some existing development tooling were available. That later
gate should not block continued product work.

### 1.1 First-admin setup flow (parallel-safe; pure product code)

Mechanic (boring, standard):

- at boot, if zero active employees exist, the API enters setup mode: it
  generates a one-time setup token, prints it to the server console/log only,
  and exposes exactly one unauthenticated endpoint:
  `POST /identity/setup/first-owner` accepting `{ setupToken, displayName,
email, password }`
- the endpoint creates an Owner-role employee and permanently exits setup mode
  (subsequent calls 404; mode never re-enters while any active employee exists)
- office-web: when the API reports setup mode (flag on an unauthenticated
  bootstrap/status response), the sign-in screen swaps to "Create the owner
  account" with a setup-token field
- rate-limit the endpoint; token is single-use; never render the token in any
  UI

Acceptance: fresh DB + no seed → operator copies token from the service log,
creates the owner in the browser, signs in; endpoint gone afterward; covered
by API spec + office test; works with seeding disabled end to end.

### 1.2 Production build outputs

Build:

- API: `nest build` → run `dist/` with `node`; prune devDependencies for the
  shipped layout; verify the estimating package builds into the artifact
- worker: replace `tsx` runtime with a `tsc` build + `node dist/index.js`
- office-web: `next build` with `output: 'standalone'` so the shipped app runs
  without the monorepo
- a `tools/build-release.mjs` that assembles `release/` containing the three
  built apps + a bundled Node runtime (no global Node required) — see D1

Acceptance: on a clean machine with nothing installed, the assembled
`release/` folder runs all three processes from compiled output.

### 1.3 Service registration

Decision D2 (service wrapper). Build: install-time registration of three
Windows services (api, worker, office-web) with restart-on-failure, log files
under the install directory, and correct start ordering (db → api → others).

Acceptance: reboot the machine; all services return; logs rotate or bound.

### 1.4 PostgreSQL provisioning

Decision D3. Recommended: bundle the user-space PostgreSQL 16 binaries the
repo's tooling already anticipates, initialized into the install directory and
registered as a service, with a generated (not default) password written to
the server config. Docker stays a dev-only path.

Acceptance: installer creates the instance and database on a machine with no
existing PostgreSQL; connection string lands in the unified config.

### 1.5 Unified server configuration

Build: one config file (e.g. `bellfield-server.env`) consumed by all three
services, written by the installer: DB connection, port, media root, media
token secret (generated), office origins (0.2), license file path (Phase 3),
relay settings (Phase 5). Replaces the four `.env.example`s for customers;
dev keeps its current flow.

### 1.6 Meaningful health endpoint

Current: `/health` returns static ok. Build: unauthenticated
`{ status: ok|degraded }` summarizing db reachability and pending-migration
state — status only, no details (details stay behind the authenticated System
surface). Used by service monitors and the installer's post-install check.

### 1.7 Migrations in the install/update path

Build: package the existing migration runner into the release; installer runs
it after DB provisioning; updater (Phase 4) runs it after laying files. The
API refuses to serve (clear error) when pending migrations exist — no
silent schema drift.

### 1.8 The installer and runbook

Decision D4 (installer technology). Build: an installer that lays the release,
writes config, provisions PostgreSQL, runs migrations, registers services,
performs the health check, and opens the browser to the first-admin setup
screen with instructions for retrieving the setup token. Plus
`docs/install-runbook.md`: install, verify, uninstall, move-to-new-server.

Phase 1 gate (the stranger test, per install-strategy): someone who has never
seen the repo installs BellField on a clean Windows machine using only the
installer and runbook, creates the owner, and books a job. Performed and
dated.

---

## Phase 2 — Backup and restore

Parallel-safe with late Phase 1. Includes the worker's job-runner substrate so
Phase 5 reuses it instead of inventing one.

Status: repo-side Phase 2 implementation landed 2026-06-11. This includes the
worker job-runner substrate, scheduled `pg_dump` + media backups, `backup_runs`
history, startup due-check from latest successful backup, orphaned-running and
old manifest-less partial-set cleanup, System backup freshness visibility,
support-bundle config summary, retention, staged restore media/license
replacement, and `docs/restore-runbook.md`. A nondestructive same-machine
validation pass is recorded in
[phase-2-local-backup-restore-smoke-2026-06-11.md](./phase-2-local-backup-restore-smoke-2026-06-11.md).
The Phase 2 gate remains a separate scratch-machine restore drill from a real
backup set, performed and dated.

### 2.1 Worker job-runner substrate

Build: give `apps/worker` a real footing — DB client, the unified config,
a minimal job loop (fixed-interval scheduling, per-job error isolation,
graceful shutdown). No queue tables, no generic framework; a boring loop the
backup job and (later) the delivery retry job both plug into.

Acceptance: worker runs a no-op job on schedule, survives a job throwing, and
shuts down cleanly as a service.

### 2.2 Scheduled backup job

Build: nightly (configurable) job producing a dated backup set: `pg_dump`
(custom format) + media-root copy, into a configured backup directory, with
retention (keep N). Record each run's outcome in a small table the System
surface can read.

### 2.3 Restore path and staleness visibility

Build: a packaged restore script (stop services → restore dump → restore
media → run migrations → start) + `docs/restore-runbook.md`; System surface
card showing last successful backup with red staleness warning past a
threshold; diagnostics check included in the rollup.

Phase 2 gate: a full restore drill onto a scratch machine succeeds from a real
backup set, performed and dated.

---

## Phase 3 — Licensing primitive

Consumed by the updater (Phase 4) and the relay (Phase 5). Design before code.

Status: repo-side Phase 3 implementation landed 2026-06-11. This includes
the license design doc, offline Ed25519 license verifier, API startup refusal
when `BELLFIELD_LICENSE_REQUIRED=true` or the release build manifest requires a
license and the configured file is missing or invalid, System/support license
visibility, private BellField-side issuance scripts, v1 key ceremony docs,
local-key smoke, and backup/restore handling for the license file. Phase 4
still owns release-date stamping and updater entitlement enforcement; Phase 5
still owns relay-token service behavior. Local nondestructive validation is
recorded in
[phase-3-local-license-smoke-2026-06-11.md](./phase-3-local-license-smoke-2026-06-11.md).

### 3.1 License design doc

Write `docs/license-design.md` pinning: signed license file format (JSON body +
signature; recommend Ed25519, public key embedded in the build), fields
(licenseId, shop name, issuedAt, updateWindowEnd, schema version), the
verification rules, and the explicit non-goals from
`asset-protection-and-licensing.md` §9 restated as constraints. The relay
credential is issued alongside the license but is a separate token — the
license file never contains relay secrets.

### 3.2 Runtime verification

Build: API boot loads and verifies the license file (path from unified
config). Refuse-to-start only when the file is missing or cryptographically
invalid. Expired update window, clock skew, offline, restored-to-new-machine:
all run. System surface shows licensee and update-window end. Source/dev runs
stay unlicensed by default; release artifacts carry a build manifest that
requires the file regardless of the env flag.

Acceptance: spec matrix covering valid / missing / tampered / expired-window /
future-dated files; tampered and missing refuse with readable errors; expired
window runs.

### 3.3 Issuance tooling (BellField-side)

Build: a private CLI (separate from the product) that generates keypairs,
issues license files, and records issued licenses (shop, licenseId, window).
One active license per shop is bookkeeping here and enforcement at the relay.

### 3.4 Relay credential issuance model

Define (doc-level now, service in Phase 5): per-shop relay token issued with
the license, delivered the same way, stored in the unified config, revocable
relay-side, single-active enforced relay-side.

Phase 3 gate: a sold-shaped build refuses to run without a valid license file
and runs forever with one, regardless of dates and connectivity.

---

## Phase 4 — Update channel

Status: repo-side Phase 4 foundation landed 2026-06-11. Release stamping,
signed update artifacts, update-window refusal, packaged updater, manual backup
CLI, and scratch updater swap are covered by local same-machine validation; see
[phase-4-local-updater-smoke-2026-06-11.md](./phase-4-local-updater-smoke-2026-06-11.md).
The full Phase 4 gate remains open until an installed v(N) machine updates to
v(N+1) through the updater with real Windows services, real pre-update backup,
health check, and a refused out-of-window build.

### 4.1 Release stamping

Build: release job producing the Phase-1 artifact with real version and
release date stamped into the existing build manifest; `readAppVersion()` reads
the manifest (not `package.json` at cwd); System surface and support bundle
show version + release date.

### 4.2 Distribution channel

Decision D6. Smallest viable: per-customer credentialed download (static
hosting + issued credentials tracked with the license). A portal is later
polish, not a launch need.

Status: built 2026-06-11 on the relay. `GET /v1/releases` and
`GET /v1/releases/:id/download` authenticate with the shop's relay token via
**identity-only verification (no activation binding)** so a support download
from another machine never moves or flaps the shop's activation. Each shop
record carries its license's `update-window-end`
(`relay-admin set-update-window`); releases dated past it refuse with renewal
copy — the installed updater remains the second wall. Artifacts live on a
read-only volume and are registered with `relay-admin publish-release`
(sha256 + size recorded); every download is logged per shop. Verified live:
listing entitlement flags, byte-exact entitled download, out-of-window 403,
unauthenticated 401, and an unchanged token-event count across downloads.

### 4.3 Updater

Build: updater (part of the installed product) that: verifies the new
artifact's signature, compares the artifact's release date to the license's
`updateWindowEnd` (refuses politely when outside — copy follows the
no-internal-leakage rule), takes an automatic pre-update backup (Phase 2
machinery), stops services, lays files, runs migrations, restarts, health
checks, and documents rollback (restore the pre-update backup).

Phase 4 gate: an installed v(N) machine updates to v(N+1) via the updater with
zero terminal use, and refuses a build dated past its window. The repo-side
script exists now, but the zero-terminal/customer-ready gate is not yet claimed.

---

## Phase 5 — Delivery relay v1 and install integration

The relay service itself plus the install-side work. Controlling design:
[delivery-relay-plan.md](./delivery-relay-plan.md). Decision D7 (relay hosting
and codebase location) blocks the service work.

Status: slices 5.1–5.5 landed 2026-06-11; **relay deployed to production
2026-06-12** at `https://relay.bellfield.app`
([relay-deployment-2026-06-12.md](./relay-deployment-2026-06-12.md)). `apps/relay` exists (token auth with
single-active binding + flap detection per
[relay-token-design.md](./relay-token-design.md), issuance CLI, narrow send
API with idempotent replay, quotas, suppression, webhook termination, status
and entitlement endpoints, reputation autothrottle); the install adapter is a
relay client with no provider key anywhere on installs; queued sends retry on
a backoff schedule with D8-pinned sender identity, 24h expiry, and widened
dedupe; the worker runs the retry/expiry/status-poll jobs; 5.5 shipped the
queued-send office UI (notice branch, Cancel with its endpoint, history
polling, entitlement surfacing with the approved copy — verified live in the
browser against the running app). Local validation: relay unit suites + live
HTTP smoke (auth, entitlement, rebind, send path, webhook refusal) against
the dev database. Remaining for the Phase 5 gate: a sold-shaped install
sending end to end through the production relay.

### 5.1 Relay service v1 (BellField-hosted)

Build, per the relay plan: relay-token auth (3.4), narrow
`send estimate document` API (composes MIME itself; enforces the shared
attachment constant), per-shop usage metering (usage-based billing with
markup), quotas, suppression list, provider webhook termination, message
status endpoint, entitlement status endpoint, per-shop revocation,
bounce/complaint monitoring with autothrottle. Transient pass-through only —
no message-body storage.

### 5.2 Install adapter swap

Build: reimplement `EmailProviderService` as the relay client (same exported
types — Phase 0.3 made the contract final): send → relay send; readiness →
relay entitlement (extending `EstimateEmailDeliveryStatus` with
`quotaExhausted | suspended`, a non-breaking union extension; both UI
consumers already gate on the boolean). Config: relay base URL + token from
unified config; `BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY` deleted. Widen
`OutboundMessageProvider` with `'relay'` (contracts + migration relaxing the
check constraint), using the 0.4 provider key.

### 5.3 Queue schema and retry semantics

Build: migration adding `attempt_count`, `next_attempt_at`, `expires_at`
(queue + 24h), a `canceled` status, and a partial index on
`(status, next_attempt_at)`. Send flow: synchronous attempt first; on a
`retryable` failure (0.3) the intent stays `queued` with backoff scheduling
instead of `failed`. Decision D8: pin `fromName`/`replyToEmail` on the intent
row at queue time (recommended) so a retry hours later sends what the office
saw, not drifted settings.

This slice also widens the dedupe (the former 0.7): any live `queued` row for
(estimate, recipient) blocks a duplicate send regardless of age, with conflict
copy distinguishing "already queued" from "just sent." Safe here — and only
here — because expiry and cancel land in the same slice.

### 5.4 Worker delivery jobs

Build on 2.1 substrate: retry job (due queued rows → snapshot via 0.6 → relay
send → mark sent/failed → timeline entry on eventual success), expiry sweep
(past `expires_at` → `failed` + timeline), and the status poller (relay poll →
`delivered`/`bounced`/`complained`; single status column for v1, accepting
that a bounce overwrites `sent` — the events table from
customer-comms-and-delivery §8 is a later refinement).

### 5.5 Office UI for queued sends

Build: third send-result branch — "Queued — will send automatically" (notice,
not error); queued history rows gain Cancel (new endpoint + repository
transition, permission `estimates:send`); panel refreshes/polls history while
a queued row exists; entitlement states surface on the panel and System card
with decided copy (open item in the relay plan).

Phase 5 gate: a sold-shaped install with only a license + relay token sends an
estimate end to end; relay outage during send queues, retries, succeeds, and
notifies; quota exhaustion blocks with safe copy; revocation cuts a shop off
without touching its server.

---

## Phase 6 — Acceptance links, then payment links

On the relay's host and auth, per customer-comms-and-delivery Phases 4–5.
Constraints already decided: acceptance records transit the relay until polled
(durable BellField receipt deferred); payment pages never touch card data or
shop processor keys — the shop's server creates processor-hosted checkout
sessions outbound, and payment confirmation follows webhook-at-relay /
poll-from-install.

Controlling design (drafted 2026-06-12):
[acceptance-links-design.md](./acceptance-links-design.md). Headlines: opaque
hashed link tokens minted in the send call, a shop-fronted server-rendered
decision page (PDF stays in the email — the relay still stores no documents),
option-group choice as the approval itself, version-pinned links so an edited
estimate is never auto-approved stale, at-least-once poll/ack delivery to the
install, and office-action-wins race rules.

Status: Phase 6a is closed as a build/functional lane. Local same-machine proof
against the live production relay passed on 2026-06-13; see
[phase-6a-live-acceptance-smoke-2026-06-13.md](./phase-6a-live-acceptance-smoke-2026-06-13.md).
Phase 6b's first payment-link slice landed on 2026-06-13: full-balance
Stripe Checkout links through the relay, relay Stripe webhook intake, worker
poll/ack, and local job-level payment ledger recording with allocations. The
sold-shaped release proof remains gate-day validation debt.

### 6a.1 Relay acceptance surface — BUILT 2026-06-12

Build: acceptance_links schema, link minting in `POST /v1/messages/estimate`,
public `GET /a/:token` page + `POST /a/:token/decision` (rate-limited,
escaped, idempotent), poll/ack endpoints for installs.

Status: landed (migration `20260612_105`, `apps/relay/src/modules/acceptance`).
Verified end to end with curl against a local relay and a real Resend send:
mint + template splice into the email, open page render, option/reason
validation, first-decision-wins decline with structured reasons + note,
409 on the second decision, poll → ack → empty, 404 on unknown tokens, and
429s from the per-link rate limit. The live relay was also exercised during
the 2026-06-13 Phase 6a smoke.

### 6a.2 Install integration — BUILT 2026-06-13

Build: send-flow `acceptance` payload + `{acceptanceLink}` template token
(auto-appended when missing), worker decision poller applying the
version-guarded approval/decline rules with "Customer" as the timeline actor.

Status: landed. The install send path pins the estimate version, shop expiry
setting, and structured option payload on the outbound row; immediate sends
and worker retries persist relay acceptance URL/id/expiry when minted. The
worker poller applies pending matching-version customer decisions, stores
fixed decline reason codes structured on the estimate, writes timeline notes
for stale/already-settled responses, and acks consumed relay decisions.

Evidence: `pnpm --filter @bellfield/worker test -- --runInBand`, `pnpm
--filter @bellfield/api test -- estimate-delivery.service.spec.ts --runInBand`,
`pnpm --filter @bellfield/office-web test -- job-estimates-section.test.tsx
--runInBand`, full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm
format:check`, `pnpm check:architecture`, `pnpm check:ui-copy`, and `git diff
--check` all passed locally on 2026-06-13. Live-relay smoke on 2026-06-13 sent
two estimates, submitted one approval and one decline through Chrome, and the
worker applied both decisions (`fetched:2`, `applied:2`).

### 6a.3 Office surfacing — BUILT 2026-06-13

Build: acceptance state on the estimate panel and history ("Awaiting customer
response", "Customer approved online"), copy per the no-leakage rule.

Status: initial office surfacing landed in the existing estimate review panel
and delivery history. It shows awaiting/expired/recorded customer-response
state without exposing the raw customer approval link as a normal office
action. API readback after the live-relay smoke showed the approved estimate
as `approved`, the declined estimate as `declined`, and structured decline
reason codes `price` and `questions` stored on the declined estimate.

### 6b.1 Full-balance Stripe Checkout payment links — BUILT 2026-06-13

Build: payment allocation schema, full-balance online-link endpoint on posted
invoices, relay Stripe Connect Checkout Session creation, relay payment-event
poll/ack API, Stripe webhook intake, worker poller that idempotently records
confirmed provider payments, and office UI to create/copy a payment link.

Status: landed as a first slice. Payments are now job-level append-only ledger
rows with invoice allocations. BellField's platform fee is one fixed rate for
all shops (default 100 basis points) and Stripe remains the hosted checkout
surface. Online payments cannot be manually voided locally; refunds/corrections
remain a deliberate later workflow.

Intentionally deferred: refunds, partial payments, deposits, estimate payments,
stored cards, customer surcharge math, invoice email delivery, and processor-fee
reconciliation beyond BellField's application fee.

Owner decisions, confirmed 2026-06-12: link expiry is per-shop configurable
(Company Settings field, 7–90 days, default 30, relay clamps); declines use
a fixed trade-neutral multi-select reason list plus "Other" (reason codes
store structured for the future unsold-estimates worklist; free text is
timeline-only); an optional note is allowed on approve. Page copy is drafted
during 6a.1 review. Shipping gate: the D7 hosting revisit is resolved — the
laptop hosts until the first paying customer has acceptance links live
(event-triggered re-decision, not a date; see the design doc).

---

## Phase 7 — Remote access (lane opened 2026-06-12, not yet sliced)

Decided: in scope, managed tier (`shopname.bellfield.app`, ~$15/mo) from day
1 plus guided bring-your-own (Tailscale walkthrough). Controlling plan:
[remote-access-plan.md](./remote-access-plan.md). Security prerequisites
(login throttling, password posture, session review) gate the managed tier;
positioning/pricing context in
[positioning-and-pricing.md](./positioning-and-pricing.md). Slicing happens
when the lane opens for build.

## Decisions

All eight decided by the owner on 2026-06-10.

| #   | Decision                                     | Decided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status  |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D1  | Runtime packaging for the release artifact   | Compiled `dist/` per app + production deps + bundled Node runtime folder; no global installs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | decided |
| D2  | Windows service wrapper                      | WinSW, bundled by the installer; one XML config per service, restart-on-failure, log rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | decided |
| D3  | PostgreSQL provisioning on customer machines | Bundled user-space PG16 binaries, installer-run `initdb`, registered service, generated password                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | decided |
| D4  | Installer technology                         | Inno Setup `setup.exe` (signable, uninstall conventions) calling BellField-owned scripts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | decided |
| D5  | Backup scheduling host                       | Worker job on the 2.1 substrate (shared with Phase 5 delivery retry), not OS scheduled tasks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | decided |
| D6  | Update distribution channel                  | Per-customer credentialed download issued with the license; portal is later polish                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | decided |
| D7  | Relay codebase location and hosting          | `apps/relay` in this monorepo, sharing `packages/contracts`; deployed separately, never in the release artifact. Hosting (decided 2026-06-11, host updated in practice): deployed on the dedicated Triton laptop (Ubuntu) as Docker containers behind a Cloudflare Tunnel (outbound-only, no inbound ports, home IP hidden); relay containers are single-purpose, image-pinned, with nightly `pg_dump` to the Unraid off-box target and external UptimeRobot health monitoring in place. Hosting revisit (decided 2026-06-12): the dedicated laptop hosts until the first paying customer has acceptance links live; no VPS or new hardware pre-revenue. Free hardening now includes DHCP reservations, off-box backups, external uptime monitoring, ethernet, and controlled reboot proof; optional hard power-loss proof remains separate hardware evidence — see `acceptance-links-design.md` and `relay-deployment-2026-06-12.md`. | decided |
| D8  | Sender identity for delayed retries          | Pin `fromName`/`replyToEmail` on the intent row at queue time, matching the frozen subject/body/recipient/PDF                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | decided |

Earlier decisions already recorded elsewhere and binding here: relay-only key
custody, usage-based marked-up relay pricing, per-shop single-active license,
shop-fronted sender, subdomain-only custom domains, 24h queue expiry, deferred
acceptance receipts (`delivery-relay-plan.md`); license posture
(`asset-protection-and-licensing.md`).

## Standing verification

- every phase gate is performed and dated, not assumed
- the launch-readiness security review runs before the first pilot install
- the stranger-install test (Phase 1 gate) re-runs after Phase 4's first
  real update and after Phase 5's config changes
- `pnpm test` / lint / typecheck / architecture / file-size / ui-copy stay
  green per slice, as always
